
Additional Context for the Cross-chain RFGP
This is an external doc that extends on the cross chain RFGP with relevant and additional information on how to think about bridging with Aztec.
Bridging into Aztec 101
Cross-chain interoperability has many dimensions to think about:


Trustless-ness
UX
Costs (for users and operators)
Latency
Complexity (for building and maintenance)

The trade-off space is complex. Some potential solutions and their trade-offs are listed below:
Bridge via L1 ❌
Easiest to build but slow and expensive for the user
RIP 7755 and natively read L2 state  ❓
Refer Base’s 7755 POC connecting solana, arbitrum etc.
May need changes in Aztec 
No clear adoption timelines from L2 (EVM or non EVM) as of today
Light client based ❌
Relatively trustless, 
High complexity to verify an L2 light client proof in Aztec and reverse. 
Every EVM L2 is slightly different from each other and some alt VMs may not support.
Integrate an existing fast bridge or interop solution (e.g. across, wormhole, hop, omni etc. ) ✅
There are 2 types here: 
Hop like designs, where there are liquidity pools for the canonical token vs hop-Token variants 
across/wormhole where you have a solver that fills orders for you via auctions.
There are 2 high level streams of work here: 
integration of the offchain solver code (integrating aztec’s fee designs, note discovery requirements and aztecJS)
Smart contracts on all chains to allow for private deposit flow
Create your own bridge ✅
This is functionally the same as the previous, but has lesser complexity.
A relayer would add cross chain events into the Aztec contract. This could be trusted in the beginning, but later on can use a variant of UMA’s Optimistic Oracle or a validity proof of an EVM event log of a certain L2 block.
Either the relayer could then solve the intent (send tokens to user) privately (via relayer’s own funds or contract’s via partial notes) or publicly. In the latter case, relayer could even do more complex things like interact with aztec defi based on the user’s intent; or the user can claim the funds on their own (like with Hop)
Withdrawals from Aztec to the other L2 could work similarly too (in terms of adding/proving the cross-chain event). With 7702/4437 and other tooling, the relayer could even execute orders for the user (like shown in Across’ uniswap integration)
The cross chain messages could even adopt EIP 7802 (used by OP Superchain) or  EIP 7683 (used by Across)
Bridge via extended L1 Portals ✅
Aztec Network has several portal teams (like Clarified Labs, Holonym and 0xBow) that will let users trustlessly bridge L1 tokens to L2. Since they behave as canonical tokens, they mint their own canonical asset on Aztec. 
One could extend these to allow bridging from other L2s and preserve the minting rights to themselves as well. This would create less slippage than fast bridges and without introducing any new liquidity fragmentation in the system. 
Sample Flows
Simply paying a friend on public L2 from Aztec, without leaking your balance (basic stealth address!)
Privately depositing into a DeFi app on public L2 from Aztec, bridge proceeds back to Aztec (use EIP-4337/7702 to automate this). It could even be done without having an Ethereum wallet installed. 
Proving an NFT ownership on another chain to get access to special items on either Aztec or the other L2.
Control assets on another chain via a private multisig on Aztec, or leverage Aztec’s account abstraction to use FaceID to control assets privately
Build zkAML/zk variants of regulatory requirements (privacy pools, proof of passports, aztec viewing keys) to privately help regulated parties to use public L2s
Arbitrary permissionless trustless code execution across both L2s
About Aztec
Aztec supports both private and public transactions. All transactions begin as private. Private functions can enqueue calls to public functions. Users generate proofs of private computations client-side and submit them along with transaction hashes, note hashes, nullifiers, etc. The sequencer processes the enqueued public functions, constructs the final transaction proof, and assembles an L2 block.
All of this is possible due to our custom VM (not EVM compatible).

In the private domain, Aztec uses UTXOs (henceforth called notes) which are nullified/destroyed upon consumption. The public domain uses a familiar contract-storage model like the EVM. Private state can only be consumed by private functions and public state only by public functions. 
Private<>Public Communication
Since private functions are run by the user while the sequencer handles public functions, private execution always happens first and public functions are sent to the sequencer. So:
Private functions can call public ones, but the reverse isn’t possible. 
Private functions also can’t use outputs from public functions in the same transaction, though they may read historical public state via the archive tree. 
Private functions don’t have access to real-time chain data (such as timestamps or block numbers) since those are determined only when the sequencer creates a new block.
Transactions are atomic: if a public function reverts, then if the private function proof was created, the whole transaction reverts. This is useful for bridges where the public side may enforce slippage protection or deadlines to fill orders.
Partial Notes circumnavigate some of the limitations of private functions:
Partial Notes
Some bridges rely on solvers to fill user intents with their own assets, or via the bridge contract’s public balance. But what if a user wants to get their funds from solvers privately and their funds are public state? A naive approach is two separate transactions: the solver “shields” funds, then the user claims them privately. 
Partial notes elegantly allow this in 1 transaction. The solver can create a private note for the user without specifying the final amount (as that is only known during public execution). The subsequent public function then calculates the amount (accounting for slippage, fees, etc.) and emits an event with this amount. The user’s wallet sees the event and completes their partial note!  This uses linear homomorphic encryption. It is a very good paradigm to for doing something privately in one transaction, even if it fundamentally depends on public execution. Partial Notes are also great for fee payment:
Fee Abstraction
On Aztec, fees can be paid in four main ways:
Fee Juice – A potential protocol-native fee token (like ETH on Ethereum). It’s public, non-transferable, and acquired only from L1 via a 1-way bridge (cannot be withdrawn back).
Fee Payment Contracts (FPCs) – Most similar to paymasters on Ethereum, FPCs are contracts that accept user’s fee in any token (specified by FPC) and pay fee juice on behalf of the user. It allows for private or public fee payments and even private fee refunds (without sequencer knowing who to refund, via partial notes).
L1 Fee Coverage – Users pay L2 fees directly from their L1 fee juice balance.
App-Sponsored Transactions – Apps cover user fees.
For a bridging proof-of-concept, app-sponsored transactions are often simplest. Every transaction begins with an “entrypoint” function that decides who pays fees. A bridge contract on Aztec, for example, could sponsor fees if the user has funds to claim or intends to deposit. Alternatively, a bridge might enqueue an FPC that uses the user’s deposit/withdrawal tokens for fees.
AuthWits
Authorization Witnesses (AuthWits) are most similar to permit signatures on Ethereum and a much safer flow than token approvals. A user signs an intent, it’s added to their account contract, the designated contract checks for its existence, uses the intent and nullifies it. In theory, the intent could be for another user (like a relayer/solver) too. However, today that is not possible as it would require the designated user to be able to nullify the user’s note (i.e. know the user’s nullifying private key). We are exploring PLUME nullifiers to make this exact approach work. But until then, authwits are only usable by non-account contracts i.e. for bridges, a solver cannot privately move your funds to aztec and get permission to do something with them. Hence the requirements only ask this feature for the withdrawal flow. 
L1->L2 messaging - “Portals”
 Aztec supports four main flows between L1 and L2:
Private Deposit (L1 → Aztec)
Public Deposit (L1 → Aztec)
Private Withdrawal (Aztec → L1)
Public Withdrawal (Aztec → L1)
Bridges (or portals as we call them on Aztec) require contracts on both L1 and L2 designated to send messages only to each other (though there doesn’t need to be a 1-1 mapping). This setup enables complex flows like withdrawing from Aztec to L1, swapping on Uniswap, then bridging back to Aztec in a single transaction.
Private Deposits: The L1 bridge sends a message to Aztec’s L1 inbox with the target L2 contract, metadata (e.g., mint(100 tokens)), and a secret hash. On Aztec, the user who knows the secret pre-image can consume this message by calling the specified function on the specified L2 contract, which checks the pre-image, nullifies the message, and proceeds to mint privately (a mint call would also enqueue a public call to adjust total supply). You could also simply mention the L2 address of the user - while that wouldn’t leak any state information, if the user were to move funds to public state, you can start linking. An interesting unexplored idea is using ephemeral account contracts for deposits.


Public Deposits: The L1 contract directly mints tokens to a known address on L2.


Withdrawals: Tokens are burned on L2 (requiring a public call to reduce total supply), generating an L2→L1 message. The Aztec sequencer includes this message in the L1 outbox contract. Any authorized user can then claim it on L1 through the corresponding bridge contract.


The Guides section does a run through of various bridging flow and is highly recommended!
Pre-confirmations, Re-orgs and L1 Finality
All bridges today inherit the risk of source chain rolling back (due to delay between a sequencer confirmation of an L2 block vs L1 finality. On optimistic rollups the delay is 7 days, and on ZK rollups it is 4-24 hours. On Aztec this is ~20 mins.).  On Aztec, bridges can get execution guarantees by running a full node and being prepared to submit proofs to the L1 rollup for their L2 transaction should it not be proven via the network..

On Aztec, L2 blocks are proposed  every 12-36 seconds to an L1 smart contract that records the pending chain. The pending chain gives execution preconfirmations before finalisation occurs.There are 32 blocks  in an epoch which are finalised via the submission of a validity proof to L1, verifying the last epoch of the pending chain. On average epochs are finalised ~20 minutes. Any person can create proofs of the epoch, even if the epoch is not full, just to ensure L1 finality of their transaction (which is in that epoch). For bridges, this means bridge operators can instantly get finality for both deposits or withdrawals to Aztec, even if the full epoch is yet to be proven. This de-risks the chance of a re-org, meaning bridges can be deterministic and have considerably faster settlement times.. 

Helpful docs and Guides
Some helpful reading material to go deeper on any of the above topics

High-level reading:

Private<>Public communication
Fee Payment Contracts
Partial Notes
AuthWits
L1 <>L2 communication

Recommended Guides/Tutorials
Sandbox Quickstart with a cli-wallet
Token bridge
Uniswap bridge
(these assume the bridge have minting rights. Still a good tutorial though!)
AuthWit
App sponsorship code (aztec.nr entrypoint method, TS tests)

Appendix 1: Note on Privacy Sets when bridging from, Public chains
To paraphrase a quote from Zooko (Founder of ZCash), privacy can only be given to “resting assets”. Said another way, since all L2s are public chains, if a user were to continuously bridge the same asset in and out of Aztec, then no amount of cryptography can help preserve their privacy. 

Developers need to therefore carefully think about privacy sets and ensure they are making use of the global privacy set that Aztec provides as opposed to fracturing it into just their bridge dapps. One such failure would be restricted to using the same bridge for deposits and withdrawals. 

