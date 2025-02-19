import { getSchnorrAccount, getSchnorrWallet } from '@aztec/accounts/schnorr'
import {
  AccountWallet,
  AztecAddress,
  PXE,
  createPXEClient,
  EthAddress,
  FeeJuicePaymentMethod,
  computePartialAddress,
  Fr,
  Fq,
} from '@aztec/aztec.js'
import { FeeJuiceContract } from '@aztec/noir-contracts.js/FeeJuice'
import { TokenContract as BananaCoin } from '@aztec/noir-contracts.js/Token'
import { FPCContract } from '@aztec/noir-contracts.js/FPC'

async function main() {
  // Initialize PXE (Private eXecution Environment)
  const pxe = createPXEClient('http://localhost:8080')

  let bobsSecretKey = Fr.random()
  let bobsPrivateSigningKey = Fq.random()
  let bobsAccountManager = await getSchnorrAccount(
    pxe,
    bobsSecretKey,
    bobsPrivateSigningKey,
    Fr.random()
  )

  let aliceSecretKey = Fr.random()
  let alicePrivateSigningKey = Fq.random()
  let aliceAccountManager = await getSchnorrAccount(
    pxe,
    aliceSecretKey,
    alicePrivateSigningKey,
    Fr.random()
  )
  // Create wallets for Alice and Bob
  const aliceWallet = await aliceAccountManager.getWallet()
  const bobWallet = await bobsAccountManager.getWallet()

  // Get addresses
  const aliceAddress = aliceWallet.getAddress()
  const bobAddress = bobWallet.getAddress()

  console.log('Alice address:', aliceAddress.toString())
  console.log('Bob address:', bobAddress.toString())

  // Deploy Fee Juice Contract
  const feeJuiceContract = await FeeJuiceContract.deploy(aliceWallet).send().deployed()
  console.log('Fee Juice Contract deployed at:', feeJuiceContract.address.toString())

  // Deploy Banana Token
  const bananaCoin = await BananaCoin.deploy(aliceWallet, aliceAddress, 'BananaCoin', 'BNC', 18n)
    .send()
    .deployed()
  console.log('BananaCoin deployed at:', bananaCoin.address.toString())

  // Deploy Fee Payment Contract (FPC)
  const bananaFPC = await FPCContract.deploy(
    aliceWallet,
    bananaCoin.address,
    aliceAddress // FPC admin
  )
    .send()
    .deployed()
  console.log('BananaFPC deployed at:', bananaFPC.address.toString())

  // Mint some Fee Juice to Bob
  const bridgeAmount = 1000000000000000000n // 1 FeeJuice
  await feeJuiceContract.methods.mint_private(bobAddress, bridgeAmount).send().wait()

  // Check Bob's Fee Juice balance
  const bobFeeJuiceBalance = await feeJuiceContract.methods
    .balance_of_private(bobAddress)
    .simulate()
  console.log('Bob Fee Juice balance:', bobFeeJuiceBalance.toString())

  // Mint some BananaCoins to Bob
  await bananaCoin.methods.mint_private(bobAddress, bridgeAmount).send().wait()

  // Check Bob's BananaCoin balance
  const bobBananaBalance = await bananaCoin.methods.balance_of_private(bobAddress).simulate()
  console.log('Bob BananaCoin balance:', bobBananaBalance.toString())

  // Example of paying fees with Fee Juice
  const paymentMethod = new FeeJuicePaymentMethod(bobAddress)

  // Bob makes a transaction using Fee Juice for payment
  const tx = await bananaCoin
    .withWallet(bobWallet)
    .methods.transfer_private(bobAddress, aliceAddress, 100n)
    .send({ fee: { paymentMethod } })
    .wait()

  console.log('Transaction fee paid:', tx.transactionFee?.toString())

  // Check Bob's remaining Fee Juice balance
  const bobFinalFeeJuiceBalance = await feeJuiceContract.methods
    .balance_of_private(bobAddress)
    .simulate()
  console.log('Bob remaining Fee Juice balance:', bobFinalFeeJuiceBalance.toString())
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
