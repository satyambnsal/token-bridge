import { getInitialTestAccountsWallets } from "@aztec/accounts/testing";
import {
  EthAddress,
  Fr,
  L1TokenManager,
  L1TokenPortalManager,
  createLogger,
  createPXEClient,
  waitForPXE,
} from "@aztec/aztec.js";
import {
  createL1Clients,
  deployL1Contract,
  deployL1Contracts,
} from "@aztec/ethereum";
import {
  TestERC20Abi,
  TestERC20Bytecode,
  TokenPortalAbi,
  TokenPortalBytecode,
} from "@aztec/l1-artifacts";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import { TokenBridgeContract } from "@aztec/noir-contracts.js/TokenBridge";
import { getContract } from "viem";

const mnemonic = "test test test test test test test test test test test junk";

const {
  ETHEREUM_HOST = "http://localhost:8545",
  PXE_URL = "http://localhost:8080",
} = process.env;
const { walletClient, publicClient } = createL1Clients(ETHEREUM_HOST, mnemonic);

const ownerEthAddress = walletClient.account.address;

const setupSandbox = async () => {
  const pxe = await createPXEClient(PXE_URL);
  await waitForPXE(pxe);
  return pxe;
};

async function deployTestERC20() {
  const constructorArgs = ["Test Token", "TEST", walletClient.account.address];
  return await deployL1Contract(
    walletClient,
    publicClient,
    TestERC20Abi,
    TestERC20Bytecode,
    constructorArgs
  ).then(({ address }) => address);
}

async function deployTokenPortal() {
  return await deployL1Contract(
    walletClient,
    publicClient,
    TokenPortalAbi,
    TokenPortalBytecode,
    []
  ).then(({ address }) => address);
}

async function main() {
  const logger = createLogger("aztec:token-bridge-tutorial");
  const amount = BigInt(100);
  const pxe = await setupSandbox();
  const wallets = await getInitialTestAccountsWallets(pxe);
  const ownerWallet = wallets[0];
  const ownerAztecAddress = wallets[0].getAddress();

  const l1ContractAddresses = (await pxe.getNodeInfo()).l1ContractAddresses;
  logger.info("L1 contract address");
  logger.info("Registry Address:", l1ContractAddresses.registryAddress);
  logger.info(`Inbox Address: ${l1ContractAddresses.inboxAddress}`);
  logger.info(`Outbox Address: ${l1ContractAddresses.outboxAddress}`);
  logger.info(`Rollup Address: ${l1ContractAddresses.rollupAddress}`);

  const l2TokenContract = await TokenContract.deploy(
    ownerWallet,
    ownerAztecAddress,
    "L2 Token",
    "L2",
    18
  )
    .send()
    .deployed();

  logger.info(`L2 token contract deployed at ${l2TokenContract.address}`);

  const l1TokenContract = await deployTestERC20();
  logger.info("erc20 contract deployed");

  const l1TokenManager = new L1TokenManager(
    l1TokenContract,
    publicClient,
    walletClient,
    logger
  );

  console.log("########### Deploy L1 Portal Contract ##########");
  const l1PortalContractAddress = await deployTokenPortal();

  logger.info("L1 portal contract deployed");

  const l1Portal = getContract({
    address: l1PortalContractAddress.toString(),
    abi: TokenPortalAbi,
    client: walletClient,
  });

  const l2BridgeContract = await TokenBridgeContract.deploy(
    ownerWallet,
    l2TokenContract.address,
    l1PortalContractAddress
  )
    .send()
    .deployed();

  logger.info(
    `L2 token bridge contract deployed at ${l2BridgeContract.address}`
  );

  await l2TokenContract.methods
    .set_minter(l2BridgeContract.address, true)
    .send()
    .wait();

  await l1Portal.write.initialize(
    [
      l1ContractAddresses.registryAddress.toString(),
      l1TokenContract.toString(),
      l2BridgeContract.address.toString(),
    ],
    {}
  );

  logger.info("L1 portal contract initialized");

  const l1PortalManager = new L1TokenPortalManager(
    l1PortalContractAddress,
    l1TokenContract,
    l1ContractAddresses.outboxAddress,
    publicClient,
    walletClient,
    logger
  );

  const claim = await l1PortalManager.bridgeTokensPublic(
    ownerAztecAddress,
    amount,
    true
  );

  await l2TokenContract.methods
    .mint_to_public(ownerAztecAddress, 0n)
    .send()
    .wait();
  await l2TokenContract.methods
    .mint_to_public(ownerAztecAddress, 0n)
    .send()
    .wait();
  // await l2TokenContract.methods
  //   .mint_to_public(ownerAztecAddress, 2n)
  //   .send()
  //   .wait();
  // await l2TokenContract.methods
  //   .mint_to_public(ownerAztecAddress, 3n)
  //   .send()
  //   .wait();

  await l2BridgeContract.methods
    .claim_public(
      ownerAztecAddress,
      amount,
      claim.claimSecret,
      claim.messageLeafIndex
    )
    .send()
    .wait();

  const balance = await l2TokenContract.methods
    .balance_of_public(ownerAztecAddress)
    .simulate();

  logger.info(`Public L2 balance of ${ownerAztecAddress} is ${balance}`);

  console.log(
    "########### WITHDRAW TOKENS FROM AZTEC TO ETHEREUM #################"
  );

  const withdrawAmount = 9n;
  const nonce = Fr.random();

  const authwit = await ownerWallet.setPublicAuthWit(
    {
      caller: l2BridgeContract.address,
      action: l2TokenContract.methods.burn_public(
        ownerAztecAddress,
        withdrawAmount,
        nonce
      ),
    },
    true
  );
  await authwit.send().wait();

  const l2Tol1Message = l1PortalManager.getL2ToL1MessageLeaf(
    withdrawAmount,
    EthAddress.fromString(ownerEthAddress),
    l2BridgeContract.address,
    EthAddress.ZERO
  );

  const l2TxReceipt = await l2BridgeContract.methods
    .exit_to_l1_public(
      EthAddress.fromString(ownerEthAddress),
      withdrawAmount,
      EthAddress.ZERO,
      nonce
    )
    .send()
    .wait();

  const newBalance = await l2TokenContract.methods
    .balance_of_public(ownerAztecAddress)
    .simulate();

  logger.info(`Public L2 new balance of ${ownerAztecAddress} is ${newBalance}`);

  const [l2ToL1MessageIndex, siblingPath] =
    await pxe.getL2ToL1MembershipWitness(
      await pxe.getBlockNumber(),
      l2Tol1Message
    );

  await l1PortalManager.withdrawFunds(
    withdrawAmount,
    EthAddress.fromString(ownerEthAddress),
    BigInt(l2TxReceipt.blockNumber!),
    l2ToL1MessageIndex,
    siblingPath
  );

  const newL1Balance = await l1TokenManager.getL1TokenBalance(ownerEthAddress);
  logger.info(`New L1 balance of ${ownerEthAddress} is ${newL1Balance}`);
}

main();
