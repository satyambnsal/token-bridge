import {
  AccountWallet,
  AztecAddress,
  AztecNode,
  CheatCodes,
  EthAddress,
  Logger,
} from '@aztec/aztec.js'
import { GasSettings } from '@aztec/circuits.js'
import { AppSubscriptionContract } from '@aztec/noir-contracts.js/AppSubscription'
import { CounterContract } from '@aztec/noir-contracts.js/Counter'

import { FeeJuiceContract } from '@aztec/noir-contracts.js/FeeJuice'
import { TokenContract as BananaCoin } from '@aztec/noir-contracts.js/Token'

export class FeesTest {
  private wallets: AccountWallet[] = []
  private logger: Logger
  public AztecNode!: AztecNode
  public cheatCodes!: CheatCodes
  public aliceWallet!: AccountWallet
  public aliceAddress!: AztecAddress
  public bobWallet!: AccountWallet
  public bobAddress!: AztecAddress
  public sequencerAddress!: AztecAddress
  public coinbase!: EthAddress

  public fpcAdmin!: AztecAddress
  public gasSettings!: GasSettings
  public feeJuiceContract!: FeeJuiceContract
  public bananaCoin!: BananaCoin
  public bananaFPC!: BananaCoin;
  public counterContract!: CounterContract
  public subscriptionContract: AppSubscriptionContract;
  public feeJuiceBridgeTestHarness: GasBridgingTestHarness;
}
