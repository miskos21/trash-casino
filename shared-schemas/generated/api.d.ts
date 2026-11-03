/* Generated from shared-schemas/api.schema.json. Run npm run schemas:generate. */

/**
 * Version 1 contracts. Only health and PING/PONG transport are implemented in milestone 1.
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
  | ServerMessage;
export type Identifier = string;
/**
 * Exact base-unit integer string. Services must also enforce u128 and budget limits.
 */
export type TokenAmount = string;
export type Avatar = "RACCOON" | "FOX" | "BEAR" | "OWL";
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
export type ClientMessage =
  PING | ROOM_CREATE | ROOM_JOIN | ROOM_READY | PLAYER_BID | CALL_BLUFF | PLAYER_CHAT | PLAYER_RECONNECT | ROOM_LEAVE;
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
  | ERROR;

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
  code: "INVALID_MESSAGE" | "NOT_IMPLEMENTED" | "UNAUTHORIZED" | "NOT_FOUND";
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
  };
}
export interface CALL_BLUFF {
  protocolVersion: 1;
  type: "CALL_BLUFF";
  requestId: Identifier | null;
  payload: {
    matchId: Identifier;
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
    winnerId: Identifier;
    settlement: "NOT_STARTED" | "PENDING" | "CONFIRMED" | "FAILED";
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
