export type NestedPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer R> ? Array<NestedPartial<R>> : NestedPartial<T[K]>
}

export type RoomStore = {
  name: string;
  bcdiceServer: string;
  bcdiceVersion: string;
  system: string;
  extend?: RoomInfoExtend; // 一時的措置
  memberNum: number;
  roomCollectionPrefix: string;
  storageId: string;
  roomPassword?: string;
};

export type TouchierStore = {
  collection: string;
  key: string;
  socketId: string;
  time: Date;
  backupUpdateTime: Date | null;
};

export type TokenStore = {
  type: "server" | "room" | "user";
  token: string;
  roomCollectionPrefix: string | null;
  roomNo: number | null;
  storageId: string | null;
  userKey: string | null;
  expires: Date;
}

export type SocketStore = {
  socketId: string;
  roomKey: string | null;
  roomNo: number | null;
  roomCollectionPrefix: string | null;
  storageId: string | null;
  userKey: string | null;
  connectTime: Date;
}
