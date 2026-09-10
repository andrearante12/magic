import type { Action, CardDict, GameState, RoomSettings } from "@mtg/shared";

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
}

/** How a player picks a deck when sitting down: a saved deck id, or raw text. */
export type DeckChoice = { deckId: string } | { text: string };

export type RoomErrorCode =
  | "no_such_room"
  | "room_full"
  | "deck_invalid"
  | "unauthorized"
  | "bad_request";

type ServerMsg =
  | { t: "hello"; clientId: string; room: string; settings: RoomSettings; user: PublicUser | null }
  | { t: "state"; state: GameState; dict: CardDict; you: string | null }
  | { t: "error"; code: RoomErrorCode; message: string }
  | { t: "pong" };

export interface NetHandlers {
  onHello?(clientId: string, room: string, settings: RoomSettings, user: PublicUser | null): void;
  onState?(state: GameState, dict: CardDict, you: string | null): void;
  onError?(code: RoomErrorCode, message: string): void;
  onOpen?(): void;
  onClose?(): void;
}

export class Net {
  private ws: WebSocket | null = null;
  private handlers: NetHandlers;
  private room: string;
  private closedByUser = false;
  private reconnectTimer: number | null = null;

  constructor(room: string, handlers: NetHandlers) {
    this.room = room;
    this.handlers = handlers;
  }

  connect() {
    this.closedByUser = false;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}/ws?room=${encodeURIComponent(this.room)}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => this.handlers.onOpen?.();
    this.ws.onmessage = (ev) => {
      const msg: ServerMsg = JSON.parse(ev.data);
      if (msg.t === "hello") this.handlers.onHello?.(msg.clientId, msg.room, msg.settings, msg.user);
      else if (msg.t === "state") this.handlers.onState?.(msg.state, msg.dict, msg.you);
      else if (msg.t === "error") this.handlers.onError?.(msg.code, msg.message);
    };
    this.ws.onclose = () => {
      this.handlers.onClose?.();
      if (!this.closedByUser) {
        this.reconnectTimer = window.setTimeout(() => this.connect(), 1500);
      }
    };
    this.ws.onerror = () => this.ws?.close();
  }

  private raw(obj: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  join(seatId: string | undefined, name: string, deck?: DeckChoice) {
    this.raw({ t: "join", seatId, name, deck });
  }

  /** Re-deck an already-seated player. */
  loadDeck(deck: DeckChoice) {
    this.raw({ t: "deck", deck });
  }

  send(action: Action) {
    this.raw({ t: "action", action });
  }

  close() {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
