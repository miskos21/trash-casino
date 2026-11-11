/* Generated from shared-schemas/api.schema.json. Run npm run schemas:generate. */

/**
 * Version 1 free-play rooms, Liar's Dice, and Blackjack contracts. No wallet or chain operations.
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
  | BLACKJACK_STATE
  | BlackjackTally
  | BlackjackShoe
  | ROOM_LEFT
  | CHAT_MESSAGE
  | MATCH_END;
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
export interface BalanceResponse {
  accountId: string;
  amount: TokenAmount;
  decimals: 24;
  symbol: "TRASH";
  network: "testnet";
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
  phase: "LOBBY" | "IN_PROGRESS" | "FINISHED";
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
}
export interface RoomSeat {
  playerId: Identifier;
  displayName: string;
  avatar: Avatar;
  npc: boolean;
  ready: boolean;
  connected: boolean;
  presence: "ONLINE" | "DISCONNECTED" | "LEFT";
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
   * 0 unless the next hand of this shoe is scheduled.
   */
  nextHandAtEpochMillis: number;
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
