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
import {readText, readYaml} from "./util";
import {TargetClient} from "./_GitHub";

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
  share: "room" | "room-mate" | "all";
  list: (Partial<StoreData<T>> & { data: T })[];
  force: boolean;
};

export type DeleteDataRequest<T> = {
  collectionSuffix: string;
  share: "room" | "room-mate" | "all";
  list: string[];
};

export type UpdateDataRequest<T> = {
  collectionSuffix: string;
  share: "room" | "room-mate" | "all";
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

export type RoomLoginResponse = { userName: string; }[];

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
  share: "room" | "room-mate" | "all",
  force: boolean,
  data: Partial<StoreData<T>> & { data: T }
) => Promise<StoreData<T>>;

export type DeleteFunc = (
  core: Core,
  socket: any,
  cnSuffix: string,
  share: "room" | "room-mate" | "all",
  key: string
) => Promise<void>;

export type UpdateFunc = (
  core: Core,
  socket: any,
  cnSuffix: string,
  share: "room" | "room-mate" | "all",
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
  });

  // 5分おきにトークン情報を整理する
  setInterval(async () => {
    const count = await core._inner.deleteExpiredToken();
    console.log(`-- TOKEN REFRESH (${count}) --`);
  }, 1000 * 60 * 5); // 5分

  console.log(`Quoridorn Server is Ready. (version: ${process.env.npm_package_version})`);
}
