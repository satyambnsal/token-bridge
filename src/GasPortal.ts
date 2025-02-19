import {
  AztecAddress,
  AztecNode,
  EthAddress,
  L1FeeJuicePortalManager,
  L1TokenManager,
  L2AmountClaim,
  Logger,
  PXE,
  retryUntil,
  Wallet,
} from '@aztec/aztec.js'
import { FeeJuiceContract } from '@aztec/noir-contracts.js/FeeJuice'
import { ProtocolContractAddress } from '@aztec/protocol-contracts'
import assert from 'assert'
import {
  type Account,
  type Chain,
  type HttpTransport,
  type PublicClient,
  type WalletClient,
} from 'viem'

export interface IGasBridge {
  getL1FeeJuiceBalance(address: EthAddress): Promise<bigint>
  prepareTokensOnL1(bridgeAmount: bigint, owner: AztecAddress): Promise<L2AmountClaim>
  bridgeFromL1ToL2(bridgeAmount: bigint, owner: AztecAddress): Promise<void>
  feeJuice: FeeJuiceContract
  l1FeeJuiceAddress: EthAddress
}

export interface FeeJuicePortalFactoryConfig {
  aztecNode: AztecNode
  pxeService: PXE
  publicClient: PublicClient<HttpTransport, Chain>
  walletClient: WalletClient<HttpTransport, Chain, Account>
  wallet: Wallet
  logger: Logger
  mockL1?: boolean
}

export class FeeJuicePortalFactory {
  private constructor(private config: FeeJuicePortalFactoryConfig) {}

  private async createReal() {
    const { aztecNode, pxeService, publicClient, walletClient, wallet, logger } = this.config
    const addresses = await walletClient.getAddresses()
    const ethAccount = EthAddress.fromString(addresses[0])

    const l1ContractAddresses = (await pxeService.getNodeInfo()).l1ContractAddresses
    const { feeJuiceAddress, feeJuicePortalAddress } = l1ContractAddresses

    if (feeJuiceAddress.isZero() || feeJuicePortalAddress.isZero()) {
      throw new Error('Fee Juice portal not deployed on l1')
    }

    const gasL2 = await FeeJuiceContract.at(ProtocolContractAddress.FeeJuice as any, wallet)

    return new GasBridge(
      aztecNode,
      pxeService,
      logger,
      gasL2,
      ethAccount,
      feeJuicePortalAddress,
      feeJuiceAddress,
      publicClient,
      walletClient
    )
  }

  static create(config: FeeJuicePortalFactoryConfig): Promise<GasBridge> {
    const factory = new FeeJuicePortalFactory(config)
    return factory.createReal()
  }
}

export class GasBridge implements IGasBridge {
  private readonly l1TokenManager: L1TokenManager
  private readonly feeJuicePortalManager: L1FeeJuicePortalManager
  constructor(
    public aztecNode: AztecNode,
    public pxeService: PXE,
    public logger: Logger,
    public feeJuice: FeeJuiceContract,
    public ethAccount: EthAddress,
    public feeJuicePortalAddress: EthAddress,
    public l1FeeJuiceAddress: EthAddress,
    public publicClient: PublicClient<HttpTransport, Chain>,
    public walletClient: WalletClient<HttpTransport, Chain, Account>
  ) {
    this.feeJuicePortalManager = new L1FeeJuicePortalManager(
      this.feeJuicePortalAddress,
      this.l1FeeJuiceAddress,
      this.publicClient,
      this.walletClient,
      this.logger
    )
    this.l1TokenManager = this.feeJuicePortalManager.getTokenManager()
  }

  async mintTokensOnL1(amount: bigint, to: EthAddress = this.ethAccount) {
    const balanceBefore = await this.l1TokenManager.getL1TokenBalance(to.toString())
    await this.l1TokenManager.mint(amount, to.toString())
    const balanceAfter = await this.l1TokenManager.getL1TokenBalance(to.toString())
    assert(balanceAfter === balanceBefore + amount)
  }

  async getL1FeeJuiceBalance(address: EthAddress) {
    return await this.l1TokenManager.getL1TokenBalance(address.toString())
  }

  sendTokensToPortalPublic(bridgeAmount: bigint, l2Address: AztecAddress, mint = false) {
    return this.feeJuicePortalManager.bridgeTokensPublic(l2Address, bridgeAmount, mint)
  }

  async consumeMessageOnAztecAndClaimPrivately(owner: AztecAddress, claim: L2AmountClaim) {
    this.logger.info('Consuming messages on L2 privately')
    const { claimAmount, claimSecret, messageLeafIndex } = claim
    await this.feeJuice.methods
      .claim(owner, claimAmount, claimSecret, messageLeafIndex)
      .send()
      .wait()
  }

  async getL2PublicBalanceOf(owner: AztecAddress) {
    return await this.feeJuice.methods.balance_of_public(owner).simulate()
  }

  async expectPublicBalanceOnL2(owner: AztecAddress, expectedBalance: bigint) {
    const balance = await this.getL2PublicBalanceOf(owner)
    assert(balance === expectedBalance)
  }

  async prepareTokensOnL1(bridgeAmount: bigint, owner: AztecAddress) {
    const claim = await this.sendTokensToPortalPublic(bridgeAmount, owner, false)

    await this.advanceL2Block()
    await this.advanceL2Block()
    return claim
  }

  private async advanceL2Block() {
    const initialBlockNumber = await this.aztecNode.getBlockNumber()
    await this.aztecNode.flushTxs()
    await retryUntil(async () => (await this.aztecNode.getBlockNumber()) >= initialBlockNumber + 1)
  }

  async bridgeFromL1ToL2(bridgeAmount: bigint, owner: AztecAddress) {
    const claim = await this.prepareTokensOnL1(bridgeAmount, owner)
    await this.consumeMessageOnAztecAndClaimPrivately(owner, claim)
    // await this.expectPublicBalanceOnL2(owner, bridgeAmount)
  }
}
