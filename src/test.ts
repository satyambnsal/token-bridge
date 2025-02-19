import { getInitialTestAccountsWallets } from '@aztec/accounts/testing'
import {
  EthAddress,
  Fr,
  createAztecNodeClient,
  createLogger,
  createPXEClient,
  waitForPXE,
} from '@aztec/aztec.js'
import { createL1Clients, deployL1Contract, deployL1Contracts } from '@aztec/ethereum'
import { FeeJuicePortalFactory, FeeJuicePortalFactoryConfig } from './GasPortal.js'
import { ethAddress, PublicClient, WalletClient } from 'viem'

const mnemonic = 'test test test test test test test test test test test junk'
const mnemonic1 = 'test test test test test test test test test test junk junk'

const { ETHEREUM_HOST = 'http://localhost:8545', PXE_URL = 'http://localhost:8080' } = process.env
const { walletClient, publicClient } = createL1Clients(ETHEREUM_HOST, mnemonic)
const { walletClient: walletClient1, publicClient: publicClient1 } = createL1Clients(
  ETHEREUM_HOST,
  mnemonic1
)

const ownerEthAddress = walletClient.account.address

const setupSandbox = async () => {
  const pxe = await createPXEClient(PXE_URL)
  await waitForPXE(pxe)
  return pxe
}

const setupNode = async () => {
  const node = await createAztecNodeClient(PXE_URL)
  return node
}

async function main() {
  const logger = createLogger('aztec:token-bridge-tutorial')
  const pxe = await setupSandbox()
  const node = await setupNode()
  const wallets = await getInitialTestAccountsWallets(pxe)
  const ownerWallet = wallets[0]

  const feePortalConfig: FeeJuicePortalFactoryConfig = {
    aztecNode: node,
    pxeService: pxe,
    walletClient: walletClient,
    publicClient: publicClient,
    logger,
    wallet: ownerWallet,
  }

  const addresses = await walletClient1.getAddresses()
  const ethAccount = EthAddress.fromString(addresses[0])

  const feeJuicePortal = await FeeJuicePortalFactory.create(feePortalConfig)
  logger.info('Minting fee juice token on L1')
  await feeJuicePortal.mintTokensOnL1(BigInt(100), ethAccount)
  logger.info('Checking balance of eth account on L1')
  console.log(await feeJuicePortal.getL1FeeJuiceBalance(ethAccount))
  logger.info('Bridge token from L1 to L2')
  await feeJuicePortal.bridgeFromL1ToL2(BigInt(10), ownerWallet.getAddress())
  const l2Balance = await feeJuicePortal.getL2PublicBalanceOf(ownerWallet.getAddress())
  console.log('Balance on L2', l2Balance)
}

main()
