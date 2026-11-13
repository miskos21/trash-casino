/* Generated from shared-schemas/api.schema.json. Run npm run schemas:generate. */

/**
 * Version 1 rooms, Liar's Dice, and Blackjack contracts, plus NEP-413 wallet sessions and paid Liar's Dice rooms on NEAR Testnet. TRASH has no real-world value.
 */
export type ApiContract =
  | Identifier
  | TokenAmount
  | Avatar
  | Bid
  | Participant
  | PublicGameState
  | PlayerGameState
  | RevealedDice
  | AgreementState
  | HealthResponse
  | ApiError
  | ChatRequest
  | OfferRequest
  | OfferResponse
  | AgentAction
  | ProfileResponse
  | BalanceResponse
  | Transaction
  | TransactionsResponse
  | ChatResponse
  | HallEntry
  | HallOfShameResponse
  | PING
  | PONG
  | CONNECTED
  | ROOM_CREATE
  | ROOM_JOIN
  | ROOM_READY
  | GAME_START
  | PLAYER_BID
  | CALL_BLUFF
  | GAME_STATE
  | TURN
  | DICE_REVEAL
  | NPC_CHAT
  | PLAYER_CHAT
  | AI_ACTION
  | GAME_RESULT
  | PLAYER_DISCONNECT
  | PLAYER_RECONNECT
  | ROOM_LEAVE
  | ERROR
  | ClientMessage
  | ServerMessage
  | ResumeToken
  | RoomSeat
  | RoomState
  | ROOM_STATE
  | ROOM_SESSION
  | ROOM_START
  | PublicGameEvent
  | GameType
  | Card
  | BlackjackHand
  | BlackjackDealer
  | BlackjackState
  | BLACKJACK_HIT
  | BLACKJACK_STAND
  | BLACKJACK_NEXT_HAND
  | BLACKJACK_STATE
  | BlackjackTally
  | BlackjackShoe
  | ROOM_LEFT
  | CHAT_MESSAGE
  | MATCH_END
  | NearAccountId
  | SessionToken
  | ChainGameId
  | TxHash
  | RoomPayout
  | RoomEconomy
  | ChainConfigResponse
  | AuthNonceResponse
  | AuthVerifyRequest
  | AuthSessionResponse;
export type Identifier = string;
/**
 * Exact base-unit integer string. Services must also enforce u128 and budget limits.
 */
export type TokenAmount = string;
export type Avatar = "RACCOON" | "FOX" | "BEAR" | "CAT" | "CAPYBARA" | "FROG";
export type AgreementState =
  | "PROPOSED"
  | "COUNTERED"
  | "ACCEPTED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "FULFILLED"
  | "REFUND_PENDING"
  | "REFUNDED"
  | "REJECTED"
  | "EXPIRED";
/**
 * NEAR account ID (named or implicit). Shape only; ownership is proven by a NEP-413 session.
 */
export type NearAccountId = string;
/**
 * Server-issued wallet session from POST /api/auth/verify. Never a wallet key.
 */
export type SessionToken = string;
export type ResumeToken = string;
export type ClientMessage =
  | PING
  | ROOM_CREATE
  | ROOM_JOIN
  | ROOM_READY
  | PLAYER_BID
  | CALL_BLUFF
  | PLAYER_CHAT
  | PLAYER_RECONNECT
  | ROOM_LEAVE
  | ROOM_START
  | BLACKJACK_HIT
  | BLACKJACK_STAND
  | BLACKJACK_NEXT_HAND
  | MATCH_END;
export type ServerMessage =
  | PONG
  | CONNECTED
  | GAME_START
  | GAME_STATE
  | TURN
  | DICE_REVEAL
  | NPC_CHAT
  | AI_ACTION
  | GAME_RESULT
  | PLAYER_DISCONNECT
  | ERROR
  | ROOM_STATE
  | ROOM_SESSION
  | BLACKJACK_STATE
  | ROOM_LEFT
  | CHAT_MESSAGE;
export type GameType = "LIARS_DICE" | "BLACKJACK";
export type ChainGameId = string;
export type TxHash = string;

export interface Bid {
  quantity: number;
  face: number;
}
export interface Participant {
  playerId: Identifier;
  displayName: string;
  avatar: Avatar;
  npc: boolean;
  diceCount: number;
  /**
   * Chips held. Every player starts with 5; a lost challenge pays one chip to the other player in it.
   */
  chips: number;
}
export interface PublicGameState {
  matchId: Identifier;
  phase: "IN_PROGRESS" | "FINISHED";
  round: number;
  /**
   * @minItems 2
   * @maxItems 4
   */
  participants:
    | [Participant, Participant]
    | [Participant, Participant, Participant]
    | [Participant, Participant, Participant, Participant];
  currentPlayerId: Identifier | null;
  lastBid: Bid | null;
  lastBidderId: Identifier | null;
  /**
   * The single player with the most chips when the match ends, or null on a tie or while playing.
   */
  winnerId: Identifier | null;
  revision: number;
  deadlineEpochMillis: number;
  resumeAtEpochMillis: number;
  /**
   * Public accepted actions only; no private dice or session credentials. Old snapshots may omit this field.
   *
   * @maxItems 60
   */
  history?: PublicGameEvent[];
}
export interface PublicGameEvent {
  id: Identifier;
  round: number;
  type: "ROUND_START" | "BID" | "CALL_BLUFF" | "ROUND_RESULT" | "GAME_OVER" | "PLAYER_LEFT";
  actorId: Identifier | null;
  bid: Bid | null;
  loserId: Identifier | null;
  actualCount: number | null;
  cause: "PLAYER" | "NPC" | "NPC_FALLBACK" | "TIMEOUT" | "UNAVAILABLE" | null;
  /**
   * ROUND_RESULT: the player who received the loser's chip.
   */
  winnerId: Identifier | null;
}
export interface PlayerGameState {
  publicState: PublicGameState;
  /**
   * @minItems 0
   * @maxItems 5
   */
  ownDice:
    | []
    | [number]
    | [number, number]
    | [number, number, number]
    | [number, number, number, number]
    | [number, number, number, number, number];
}
export interface RevealedDice {
  playerId: Identifier;
  /**
   * @minItems 0
   * @maxItems 5
   */
  dice:
    | []
    | [number]
    | [number, number]
    | [number, number, number]
    | [number, number, number, number]
    | [number, number, number, number, number];
}
export interface HealthResponse {
  status: "UP";
  service: "raccoon-royale-backend";
  network: "testnet";
  protocolVersion: 1;
}
export interface ApiError {
  code:
    | "INVALID_MESSAGE"
    | "NOT_IMPLEMENTED"
    | "UNAUTHORIZED"
    | "NOT_FOUND"
    | "ROOM_NOT_FOUND"
    | "ROOM_FULL"
    | "ROOM_STARTED"
    | "NOT_READY"
    | "NOT_HOST"
    | "ILLEGAL_ACTION"
    | "STALE_STATE"
    | "ALREADY_IN_ROOM"
    | "INVALID_SESSION"
    | "RATE_LIMITED";
  message: string;
}
export interface ChatRequest {
  matchId: Identifier;
  message: string;
}
export interface OfferRequest {
  matchId: Identifier;
  service: "OWN_DICE";
  proposedPrice: TokenAmount;
}
export interface OfferResponse {
  agreementId: Identifier;
  state: AgreementState;
  price: TokenAmount;
}
export interface AgentAction {
  action: "BID" | "CALL_BLUFF" | "CHAT" | "ACCEPT" | "REJECT" | "COUNTER" | "TIP";
  bid: Bid | null;
  proposedPrice: TokenAmount;
  message: string;
  agreementId: Identifier | null;
}
export interface ProfileResponse {
  playerId: Identifier;
  displayName: string;
  walletAccountId: string;
}
/**
 * TRASH in the player's wallet (token) and in their casino balance. Read from the chain.
 */
export interface BalanceResponse {
  accountId: NearAccountId;
  wallet: TokenAmount;
  casino: TokenAmount;
  decimals: 24;
  symbol: "TRASH";
  /**
   * sandbox only for a local rehearsal; never mainnet
   */
  network: "testnet" | "sandbox";
}
export interface Transaction {
  transactionHash: string;
  state: "PENDING" | "SUCCEEDED" | "FAILED";
  amount: TokenAmount;
}
export interface TransactionsResponse {
  /**
   * @minItems 0
   */
  transactions: Transaction[];
}
export interface ChatResponse {
  agentId: Identifier;
  message: string;
}
export interface HallEntry {
  matchId: Identifier;
  attackerMessage: string;
  result: string;
}
export interface HallOfShameResponse {
  /**
   * @minItems 0
   */
  entries: HallEntry[];
}
export interface PING {
  protocolVersion: 1;
  type: "PING";
  requestId: Identifier | null;
  payload: {};
}
export interface PONG {
  protocolVersion: 1;
  type: "PONG";
  requestId: Identifier | null;
  payload: {};
}
export interface CONNECTED {
  protocolVersion: 1;
  type: "CONNECTED";
  requestId: Identifier | null;
  payload: {
    service: "raccoon-royale-backend";
  };
}
export interface ROOM_CREATE {
  protocolVersion: 1;
  type: "ROOM_CREATE";
  requestId: Identifier | null;
  payload: {
    displayName: string;
    avatar: Avatar;
    /**
     * Defaults to LIARS_DICE for older clients. The web client selects BLACKJACK by default.
     */
    game?: "LIARS_DICE" | "BLACKJACK";
    /**
     * Rule-based NPC seats: 1 adds Don Raccoone, 2 also adds Foxy. Defaults to 1.
     */
    agents?: number;
    /**
     * Paid room on NEAR Testnet: every human needs a wallet session; stakes come from casino balances without extra signatures. Liar's Dice uses the fixed buy-in; Blackjack uses betTrash per hand. Defaults to false.
     */
    paid?: boolean;
    sessionToken?: SessionToken;
    /**
     * Paid Blackjack only: starting TRASH bet per hand (whole TRASH). Each player can change it before every hand. Defaults to 1.
     */
    betTrash?: number;
  };
}
export interface ROOM_JOIN {
  protocolVersion: 1;
  type: "ROOM_JOIN";
  requestId: Identifier | null;
  payload: {
    roomCode: string;
    displayName: string;
    avatar: Avatar;
    sessionToken?: SessionToken;
  };
}
export interface ROOM_READY {
  protocolVersion: 1;
  type: "ROOM_READY";
  requestId: Identifier | null;
  payload: {
    roomId: Identifier;
    ready: boolean;
  };
}
export interface GAME_START {
  protocolVersion: 1;
  type: "GAME_START";
  requestId: Identifier | null;
  payload: {
    matchId: Identifier;
  };
}
export interface PLAYER_BID {
  protocolVersion: 1;
  type: "PLAYER_BID";
  requestId: Identifier | null;
  payload: {
    matchId: Identifier;
    bid: Bid;
    expectedRevision: number;
  };
}
export interface CALL_BLUFF {
  protocolVersion: 1;
  type: "CALL_BLUFF";
  requestId: Identifier | null;
  payload: {
    matchId: Identifier;
    expectedRevision: number;
  };
}
export interface GAME_STATE {
  protocolVersion: 1;
  type: "GAME_STATE";
  requestId: Identifier | null;
  payload: PlayerGameState;
}
export interface TURN {
  protocolVersion: 1;
  type: "TURN";
  requestId: Identifier | null;
  payload: {
    matchId: Identifier;
    playerId: Identifier;
    deadlineEpochMillis: number;
  };
}
export interface DICE_REVEAL {
  protocolVersion: 1;
  type: "DICE_REVEAL";
  requestId: Identifier | null;
  payload: {
    matchId: Identifier;
    round: number;
    /**
     * @minItems 2
     * @maxItems 4
     */
    dice:
      | [RevealedDice, RevealedDice]
      | [RevealedDice, RevealedDice, RevealedDice]
      | [RevealedDice, RevealedDice, RevealedDice, RevealedDice];
    loserId: Identifier;
    bidderId: Identifier;
    callerId: Identifier;
    bid: Bid;
    actualCount: number;
    winnerId: Identifier;
  };
}
export interface NPC_CHAT {
  protocolVersion: 1;
  type: "NPC_CHAT";
  requestId: Identifier | null;
  payload: {
    matchId: Identifier;
    agentId: Identifier;
    message: string;
  };
}
export interface PLAYER_CHAT {
  protocolVersion: 1;
  type: "PLAYER_CHAT";
  requestId: Identifier | null;
  payload: ChatRequest;
}
export interface AI_ACTION {
  protocolVersion: 1;
  type: "AI_ACTION";
  requestId: Identifier | null;
  payload: {
    matchId: Identifier;
    agentId: Identifier;
    action: "BID" | "CALL_BLUFF" | "CHAT" | "ACCEPT" | "REJECT" | "COUNTER" | "TIP";
    message: string;
  };
}
export interface GAME_RESULT {
  protocolVersion: 1;
  type: "GAME_RESULT";
  requestId: Identifier | null;
  payload: {
    matchId: Identifier;
    /**
     * The single player with the most chips, or null on a tie.
     */
    winnerId: Identifier | null;
    settlement: "NOT_STARTED" | "PENDING" | "CONFIRMED" | "FAILED";
    /**
     * Final chips per seat. A future escrow pays chips × chip value, which always sums to the buy-ins.
     *
     * @minItems 2
     * @maxItems 4
     */
    standings:
      | [
          {
            playerId: Identifier;
            chips: number;
          },
          {
            playerId: Identifier;
            chips: number;
          }
        ]
      | [
          {
            playerId: Identifier;
            chips: number;
          },
          {
            playerId: Identifier;
            chips: number;
          },
          {
            playerId: Identifier;
            chips: number;
          }
        ]
      | [
          {
            playerId: Identifier;
            chips: number;
          },
          {
            playerId: Identifier;
            chips: number;
          },
          {
            playerId: Identifier;
            chips: number;
          },
          {
            playerId: Identifier;
            chips: number;
          }
        ];
  };
}
export interface PLAYER_DISCONNECT {
  protocolVersion: 1;
  type: "PLAYER_DISCONNECT";
  requestId: Identifier | null;
  payload: {
    roomId: Identifier;
    playerId: Identifier;
  };
}
export interface PLAYER_RECONNECT {
  protocolVersion: 1;
  type: "PLAYER_RECONNECT";
  requestId: Identifier | null;
  payload: {
    roomId: Identifier;
    resumeToken: ResumeToken;
  };
}
export interface ROOM_LEAVE {
  protocolVersion: 1;
  type: "ROOM_LEAVE";
  requestId: Identifier | null;
  payload: {
    roomId: Identifier;
  };
}
export interface ERROR {
  protocolVersion: 1;
  type: "ERROR";
  requestId: Identifier | null;
  payload: ApiError;
}
export interface ROOM_START {
  protocolVersion: 1;
  type: "ROOM_START";
  requestId: Identifier | null;
  payload: {
    roomId: Identifier;
  };
}
export interface BLACKJACK_HIT {
  protocolVersion: 1;
  type: "BLACKJACK_HIT";
  requestId: Identifier | null;
  payload: {
    matchId: Identifier;
    expectedRevision: number;
  };
}
export interface BLACKJACK_STAND {
  protocolVersion: 1;
  type: "BLACKJACK_STAND";
  requestId: Identifier | null;
  payload: {
    matchId: Identifier;
    expectedRevision: number;
  };
}
/**
 * Ready for the next Blackjack hand. The server deals when every seated human has asked, or when nextHandAtEpochMillis passes.
 */
export interface BLACKJACK_NEXT_HAND {
  protocolVersion: 1;
  type: "BLACKJACK_NEXT_HAND";
  requestId: Identifier | null;
  payload: {
    matchId: Identifier;
    /**
     * The hand just shown (RESULT), or 0 before the first hand of a paid shoe; a request for an older hand is rejected.
     */
    hand: number;
    /**
     * Paid Blackjack only: whole TRASH to bet on the coming hand. Omitted keeps the previous bet.
     */
    betTrash?: number;
  };
}
export interface MATCH_END {
  protocolVersion: 1;
  type: "MATCH_END";
  requestId: Identifier | null;
  /**
   * Host only: end a running Liar's Dice match; chips become final standings.
   */
  payload: {
    roomId: Identifier;
    matchId: Identifier;
  };
}
export interface ROOM_STATE {
  protocolVersion: 1;
  type: "ROOM_STATE";
  requestId: Identifier | null;
  payload: RoomState;
}
export interface RoomState {
  roomId: Identifier;
  roomCode: string;
  phase: "LOBBY" | "FUNDING" | "IN_PROGRESS" | "FINISHED";
  hostId: Identifier;
  youId: Identifier;
  /**
   * @minItems 1
   * @maxItems 4
   */
  participants:
    [RoomSeat] | [RoomSeat, RoomSeat] | [RoomSeat, RoomSeat, RoomSeat] | [RoomSeat, RoomSeat, RoomSeat, RoomSeat];
  game: GameType;
  /**
   * How agents decide: a live LLM, or the labelled offline mock used without an API key.
   */
  agentMode: "LLM" | "TEMPORARY_MOCK";
  economy?: RoomEconomy | null;
}
export interface RoomSeat {
  playerId: Identifier;
  displayName: string;
  avatar: Avatar;
  npc: boolean;
  ready: boolean;
  connected: boolean;
  presence: "ONLINE" | "DISCONNECTED" | "LEFT";
  accountId?: NearAccountId | null;
}
/**
 * Paid room status. The chain is the source of truth; these values come from confirmed final execution outcomes.
 */
export interface RoomEconomy {
  mode: "PAID";
  buyIn: TokenAmount;
  casinoId: NearAccountId;
  gameId: ChainGameId | null;
  funding: "NOT_STARTED" | "CREATING" | "AWAITING_PAYMENTS" | "FUNDED" | "CANCELLING" | "CANCELLED" | "FAILED";
  fundingDeadlineEpochMillis: number;
  paidPlayerIds: Identifier[];
  settlement: "NOT_STARTED" | "PENDING" | "CONFIRMED" | "FAILED";
  settlementTxHash: TxHash | null;
  payouts: RoomPayout[];
  message: string | null;
}
export interface RoomPayout {
  playerId: Identifier;
  accountId: NearAccountId;
  amount: TokenAmount;
}
export interface ROOM_SESSION {
  protocolVersion: 1;
  type: "ROOM_SESSION";
  requestId: Identifier | null;
  payload: {
    roomId: Identifier;
    roomCode: string;
    playerId: Identifier;
    resumeToken: ResumeToken;
  };
}
export interface BLACKJACK_STATE {
  protocolVersion: 1;
  type: "BLACKJACK_STATE";
  requestId: Identifier | null;
  payload: BlackjackState;
}
export interface BlackjackState {
  matchId: Identifier;
  /**
   * FINISHED only when the shoe has ended; hands continue while IN_PROGRESS.
   */
  phase: "IN_PROGRESS" | "FINISHED";
  hand: number;
  /**
   * SHUFFLING (hand 0) precedes the first deal; RESULT shows the settled hand before the next deal.
   */
  handPhase: "SHUFFLING" | "PLAYING" | "RESULT";
  cardsRemaining: number;
  /**
   * 0 unless the next hand is scheduled. In RESULT, 0 means the deal waits for every seated human to send BLACKJACK_NEXT_HAND.
   */
  nextHandAtEpochMillis: number;
  /**
   * Players who already asked for the next hand (RESULT only).
   *
   * @maxItems 4
   */
  nextHandReady:
    | []
    | [Identifier]
    | [Identifier, Identifier]
    | [Identifier, Identifier, Identifier]
    | [Identifier, Identifier, Identifier, Identifier];
  /**
   * @minItems 1
   * @maxItems 4
   */
  players:
    | [BlackjackHand]
    | [BlackjackHand, BlackjackHand]
    | [BlackjackHand, BlackjackHand, BlackjackHand]
    | [BlackjackHand, BlackjackHand, BlackjackHand, BlackjackHand];
  dealer: BlackjackDealer;
  currentPlayerId: Identifier | null;
  revision: number;
  deadlineEpochMillis: number;
  shoe: BlackjackShoe;
}
export interface BlackjackHand {
  playerId: Identifier;
  displayName: string;
  avatar: Avatar;
  npc: boolean;
  /**
   * @minItems 0
   * @maxItems 12
   */
  cards:
    | []
    | [Card]
    | [Card, Card]
    | [Card, Card, Card]
    | [Card, Card, Card, Card]
    | [Card, Card, Card, Card, Card]
    | [Card, Card, Card, Card, Card, Card]
    | [Card, Card, Card, Card, Card, Card, Card]
    | [Card, Card, Card, Card, Card, Card, Card, Card]
    | [Card, Card, Card, Card, Card, Card, Card, Card, Card]
    | [Card, Card, Card, Card, Card, Card, Card, Card, Card, Card]
    | [Card, Card, Card, Card, Card, Card, Card, Card, Card, Card, Card]
    | [Card, Card, Card, Card, Card, Card, Card, Card, Card, Card, Card, Card];
  total: number;
  status: "PLAYING" | "STOOD" | "BUST" | "BLACKJACK";
  outcome: ("WIN" | "LOSE" | "PUSH" | "BLACKJACK") | null;
  tally: BlackjackTally;
}
export interface Card {
  rank: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
  suit: "S" | "H" | "D" | "C";
}
/**
 * Results across the hands of the current shoe. Blackjacks also count as wins.
 */
export interface BlackjackTally {
  wins: number;
  losses: number;
  pushes: number;
  blackjacks: number;
}
/**
 * The house dealer. It has no seat and follows fixed rules.
 */
export interface BlackjackDealer {
  /**
   * Face-up cards only. The hole card is never sent before the dealer reveals it.
   *
   * @minItems 0
   * @maxItems 12
   */
  cards:
    | []
    | [Card]
    | [Card, Card]
    | [Card, Card, Card]
    | [Card, Card, Card, Card]
    | [Card, Card, Card, Card, Card]
    | [Card, Card, Card, Card, Card, Card]
    | [Card, Card, Card, Card, Card, Card, Card]
    | [Card, Card, Card, Card, Card, Card, Card, Card]
    | [Card, Card, Card, Card, Card, Card, Card, Card, Card]
    | [Card, Card, Card, Card, Card, Card, Card, Card, Card, Card]
    | [Card, Card, Card, Card, Card, Card, Card, Card, Card, Card, Card]
    | [Card, Card, Card, Card, Card, Card, Card, Card, Card, Card, Card, Card];
  hiddenCards: number;
  /**
   * Total of the face-up cards.
   */
  total: number;
}
/**
 * Casino-style shoe. commitment = SHA-256 hex of salt + ':' + comma-separated order (rank+suit), published before the first card. The reveal appears only after the shoe ends. It proves the order did not change during play, not that the shuffle was random.
 */
export interface BlackjackShoe {
  decks: number;
  size: number;
  burned: number;
  handStart: number;
  commitment: string;
  reveal: null | {
    salt: string;
    /**
     * @minItems 1
     * @maxItems 312
     */
    order: [Card, ...Card[]];
  };
}
export interface ROOM_LEFT {
  protocolVersion: 1;
  type: "ROOM_LEFT";
  requestId: Identifier | null;
  payload: {
    roomId: Identifier;
  };
}
export interface CHAT_MESSAGE {
  protocolVersion: 1;
  type: "CHAT_MESSAGE";
  requestId: Identifier | null;
  /**
   * Public table chat. Player text is untrusted: agents read it as data and it never changes their permissions.
   */
  payload: {
    matchId: Identifier;
    messageId: Identifier;
    senderId: Identifier;
    senderName: string;
    agent: boolean;
    text: string;
    sentAtEpochMillis: number;
  };
}
export interface ChainConfigResponse {
  enabled: boolean;
  /**
   * sandbox only for a local rehearsal; never mainnet
   */
  network: "testnet" | "sandbox";
  tokenId: NearAccountId | null;
  casinoId: NearAccountId | null;
  explorerUrl: string;
  buyIn: TokenAmount;
  decimals: 24;
  symbol: "TRASH";
}
/**
 * NEP-413 challenge. Sign exactly message, recipient, and the 32-byte nonce.
 */
export interface AuthNonceResponse {
  message: string;
  recipient: string;
  /**
   * Base64 of 32 bytes
   */
  nonce: string;
  expiresAtEpochMillis: number;
}
export interface AuthVerifyRequest {
  accountId: NearAccountId;
  publicKey: string;
  /**
   * Base64 signature from the wallet
   */
  signature: string;
  nonce: string;
}
export interface AuthSessionResponse {
  accountId: NearAccountId;
  sessionToken: SessionToken;
  expiresAtEpochMillis: number;
}
