import {connectMongoDb} from "./_MongoDb";
import {makeMinioClient} from "./_Minio";
import {makeExpressServer} from "./_Express";
import {
  CoreDbInner,
  CoreImpl,
  CoreInner,
  CoreLib, CoreLog,
  CoreSimpleDb,
  CoreSocket,
  CoreSocketApi,
  SystemCollection
} from "./core";
import commonSocketApiFuncMap from "./_SocketApi";
import {Db} from "mongodb";
import * as Minio from "minio";
import * as YAML from "yaml";
import * as fs from "fs";
import {compareVersion, TargetClient} from "./_GitHub";
import {SystemError} from "./error/SystemError";
const crypto = require("crypto");

export type RoomStore = {
  name: string;
  bcdiceServer: string;
  bcdiceVersion: string;
  system: string;
  extend?: RoomInfoExtend; // 一時的措置
  memberNum: number;
  roomCollectionPrefix: string;
  storageId: string;
  roomPassword: string;
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
export type IconClass =
  | "icon-warning"
  | "icon-youtube2"
  | "icon-image"
  | "icon-music"
  | "icon-text";

export type UrlType = "youtube" | "image" | "music" | "setting" | "unknown";

/**
 * 部屋の追加情報
 */
export type RoomInfoExtend = {
  visitable: boolean; // 見学許可
  isFitGrid: boolean; // マップオブジェクトをセルに自動調整するか
  isViewDice: boolean; // ダイスを表示するか
  isViewCutIn: boolean; // カットインを表示するか
  isDrawGridId: boolean; // マップ座標を表示するか
  mapRotatable: boolean; // マップを回転させるか
  isShowStandImage: boolean; // 立ち絵を表示するか,
  standImageGridNum: number; // 立ち絵を表示する位置の数
  isShowRotateMarker: boolean; // マップオブジェクトの回転マーカーを表示するか
  windowSettings: WindowSettings;
};

export type WindowSetting =
  | "not-use" // 使えなくします
  | "free" // 特に指定はありません
  | "init-view" // 入室時に表示します
  | "always-open"; // 常に開いています。閉じることはできません。

export type WindowSettings = {
  chat: WindowSetting;
  initiative: WindowSetting;
  "chat-palette": WindowSetting;
  "counter-remocon": WindowSetting;
};

export type UserType = "gm" | "pl" | "visitor";

export type UserLoginRequest = {
  name: string;
  password: string;
  type?: UserType;
};

export type UserLoginResponse = {
  userKey: string;
  token: string;
}

export type UploadMediaInfo = MediaStore & { key?: string } & (
  | { dataLocation: "direct" }
  | {
  dataLocation: "server";
  blob?: Blob;
  arrayBuffer?: string;
}
  );

export type MediaStore = {
  name: string;
  rawPath: string;
  hash: string;
  mediaFileId: string;
  tag: string;
  url: string;
  urlType: UrlType;
  iconClass: IconClass;
  imageSrc: string;
  dataLocation: "server" | "direct";
};

export type ClientUserData = {
  key?: string;
  refList: DataReference[];
  name: string;
  type: UserType;
  login: number;
}

/**
 * userCCのデータ定義
 * ユーザ1人に関する情報
 */
export type UserStore = {
  name: string;
  type: UserType;
  login: number;
  password: string;
  isExported: boolean;
  token: string;
};
/**
 * DBに格納されるデータのラッパー
 */
export type DataReference = {
  type: string | null;
  key: string | null;
};

export type StoreData<T> = {
  _id?: any;
  collection: string;
  key: string;
  order: number;
  ownerType: string | null;
  owner: string | null; // 部屋データに含まれるデータのオーナー。部屋データにはオーナーは存在しない
  permission: Permission | null; // 通常はnullではない
  status:
    | "initial-touched"
    | "added"
    | "modified";
  createTime: Date;
  updateTime: Date | null;
  refList: DataReference[]; // このデータへの参照
  data: T | null;
};

/**
 * 権限対象の種別
 */
export type PermissionNodeType = "group" | "actor" | "owner";

/**
 * 権限対象1件の表現
 */
export type PermissionNode = {
  type: PermissionNodeType;
  key?: string;
};

/**
 * 権限のルールタイプ
 */
export type PermissionRuleType = "none" | "allow" | "deny";

/**
 * 権限のルール単位の表現
 */
export type PermissionRule = {
  type: PermissionRuleType;
  list: PermissionNode[];
};

/**
 * 表示・編集・権限編集の3種の権限の集合体。
 * これがDBデータ1件ごとに設定される
 */
export type Permission = {
  view: PermissionRule;
  edit: PermissionRule;
  chmod: PermissionRule;
};

export interface Core {
  COLLECTION_ROOM: SystemCollection;
  COLLECTION_TOUCH: SystemCollection;
  COLLECTION_SOCKET: SystemCollection;
  COLLECTION_TOKEN: SystemCollection;

  db: Db;
  bucket: string;
  accessUrl: string;
  s3Client: Minio.Client;
  expressServer: any;
  io: any;
  serverSetting: ServerSetting;
  targetClient: TargetClient;
  appServerInfo: AppServerInfo;

  log: CoreLog;
  socket: CoreSocket;
  socketApi: CoreSocketApi;
  lib: CoreLib;
  _dbInner: CoreDbInner;
  _inner: CoreInner;
  _simpleDb: CoreSimpleDb;
}

export type AddDirectRequest<T> = {
  collectionSuffix: string;
  share: "room" | "room-mate";
  list: (Partial<StoreData<T>> & { data: T })[];
  force: boolean;
};

export type DeleteDataRequest = {
  collectionSuffix: string;
  share: "room" | "room-mate";
  list: string[];
};

export type UpdateDataRequest<T> = {
  collectionSuffix: string;
  share: "room" | "room-mate";
  list: (Partial<StoreData<Partial<T>>> & { key: string })[];
};

export type GetRoomListResponse = {
  roomList: ClientRoomData[] | null;
  maxRoomNo: number;
  appServerInfo: {
    title: string;
    descriptions: string[];
    termsOfUse: string;
  };
  isNeedRoomCreatePassword: boolean;
};

export type ClientRoomData = {
  roomNo: number;
  status: "initial-touched" | "added" | "modified";
  operator: string; // socket.id
  detail: null | {
    roomName: string;
    memberNum: number;
    extend?: RoomInfoExtend;
  }
}

export type RoomLoginRequest = {
  roomNo: number;
  roomPassword: string;
};

export type UploadMediaRequest = {
  uploadMediaInfoList: UploadMediaInfo[];
  option: Partial<StoreData<any>>;
};

export type UploadMediaResponse = {
  key: string;
  rawPath: string;
  url: string;
  name: string;
  tag: string;
  urlType: UrlType;
}[];

export type SendDataRequest = {
  target: string[] | "self" | "room" | "room-mate" | "all";
  event: string;
  error: any;
  data: any;
};

export type MinioSetting = {
  bucket: string;
  accessUrl: string;
  endPoint: string;
  port: number;
  accessKey: string;
  secretKey: string;
  useSSL: boolean;
};

export type CreateRoomRequest = {
  roomKey: string;
  roomPassword: string;
  name: string;
  bcdiceServer: string;
  bcdiceVersion: string;
  system: string;
  extend?: RoomInfoExtend; // 一時的措置
  roomCreatePassword?: string;
};

export type DeleteRoomRequest = {
  roomNo: number;
  roomPassword: string;
};

export type InsertFunc = <T>(
  core: Core,
  socket: any,
  cnSuffix: string,
  share: "room" | "room-mate",
  force: boolean,
  data: Partial<StoreData<T>> & { data: T }
) => Promise<StoreData<T>>;

export type DeleteFunc = (
  core: Core,
  socket: any,
  cnSuffix: string,
  share: "room" | "room-mate",
  key: string
) => Promise<void>;

export type UpdateFunc = (
  core: Core,
  socket: any,
  cnSuffix: string,
  share: "room" | "room-mate",
  data: (Partial<StoreData<Partial<any>>> & { key: string })
) => Promise<void>;

export type SocketApiFunc = (
  core: Core,
  socket: any,
  arg: any
) => Promise<any>;

export type Interoperability = {
  server: string;
  client: string;
};

export type ServerSetting = {
  port: number;
  webApiPassword: string;
  webApiPathBase: string;
  webApiTokenExpires: number;
  storeType: "memory" | "mongodb";
  secretCollectionSuffix: string;
  mongodbConnectionStrings: string;
  roomCreatePassword: string;
  roomNum: number;
  roomAutoRemove: number;
};

export const PERMISSION_DEFAULT: Permission = {
  view: { type: "none", list: [] },
  edit: { type: "none", list: [] },
  chmod: { type: "none", list: [] }
};

export type RestApiResister = (webApp: any, core: Core) => void;

export type AppServerInfo = {
  title: string;
  descriptions: string[];
  termsOfUse: string;
};
export function makeAppServerInfo(termsOfUseTxtPath: string, serverInfoYamlPath: string): AppServerInfo {
  const termsOfUse: string = readText(termsOfUseTxtPath);
  const info: AppServerInfo = readYaml(serverInfoYamlPath);
  info.termsOfUse = termsOfUse.trim().replace(/(\r\n)/g, "\n");
  return info;
}

export default async function bootUp(
  serverSetting: ServerSetting,
  minioSetting: MinioSetting,
  targetVersionInfo: TargetClient,
  dbNameSuffix: string,
  log4jSettingJsonPath: string,
  termsOfUseTxtPath: string,
  serverInfoYamlPath: string,
  insertFuncMap: Map<string, InsertFunc>,
  deleteFuncMap: Map<string, DeleteFunc>,
  updateFuncMap: Map<string, UpdateFunc>,
  socketApiFuncMap: Map<string, SocketApiFunc>,
  restApiResisterList: RestApiResister[]
) {
  const db = await connectMongoDb(serverSetting.mongodbConnectionStrings, dbNameSuffix);
  const {s3Client, bucket, accessUrl} = await makeMinioClient(minioSetting);
  const {expressServer, io} = makeExpressServer(serverSetting.port);
  const appServerInfo = makeAppServerInfo(termsOfUseTxtPath, serverInfoYamlPath);
  const core = await CoreImpl.instance(
    db,
    s3Client,
    bucket,
    accessUrl,
    expressServer,
    io,
    serverSetting,
    targetVersionInfo,
    appServerInfo,
    log4jSettingJsonPath,
    insertFuncMap,
    deleteFuncMap,
    updateFuncMap
  );

  restApiResisterList.forEach(r => r(expressServer, core));

  core.io.on("connection", async (socket: any) => {
    core.log.accessLog(socket.id, "CONNECTED");

    // 接続情報に追加
    await core._inner.socketIn(socket);

    socket.on("disconnect", async () => {
      core.log.accessLog(socket.id, "DISCONNECTED");
      try {
        // 接続情報から削除
        await core._inner.socketOut(socket);
      } catch (err) {
        console.error(err);
      }
    });
    socket.on("error", () => {
      console.log("error", socket.id);
    });

    // socket.ioの各リクエストに対する処理の登録
    commonSocketApiFuncMap.forEach(core.socket.setEvent.bind(core.socket, socket));
    socketApiFuncMap.forEach(core.socket.setEvent.bind(core.socket, socket));

    await core.socket.emitSocketEvent(
      socket,
      "self",
      "server-ready",
      null,
      { ok: true }
    );
  });

  // 1分おきにDBを監視
  setInterval(async () => {
    const tokenCount = await core._inner.deleteExpiredToken();
    if (tokenCount) {
      console.log(`-- TOKEN DELETE (num: ${tokenCount}) --`);
    }
    const roomCount = await core._inner.deleteTouchedRoom();
    if (roomCount) {
      console.log(`-- ROOM DELETE (num: ${roomCount}) --`);
    }
  }, 1000 * 60); // 1分

  console.log(`Quoridorn Server is Ready. (version: ${process.env.npm_package_version})`);
}

export function readText(path: string): string {
  return fs.readFileSync(path, "utf8");
}

export function readYaml<T>(path: string): T {
  return YAML.parse(readText(path)) as T;
}

export function getFileHash(arrayBuffer: ArrayBuffer | string) {
  return crypto.createHash('sha512').update(arrayBuffer).digest('hex');
}

export async function getTargetClient(
  process: NodeJS.Process,
  interoperabilityYamlPath: string
): Promise<TargetClient> {
  if (!process.env.npm_package_version) {
    throw new SystemError(`The version is not set in package.json.`);
  }
  const version: string = `Quoridorn ${process.env.npm_package_version.replace("-", "")}`;
  const targetClient: TargetClient = { from: null, to: null }
  const iList: Interoperability[] = readYaml(interoperabilityYamlPath);
  if (compareVersion(iList[0].server, version) <= 0) {
    // サーバが最新系
    targetClient.from = iList[0].client;
  } else {
    // サーバは最新系ではない
    iList.forEach((i, index) => {
      if (!index) return;
      if (
        compareVersion(iList[index - 1].server, version) > 0 &&
        compareVersion(i.server, version) <= 0
      ) {
        targetClient.from = i.client;
        targetClient.to = iList[index - 1].client;
      }
    });
  }

  return targetClient;
}
