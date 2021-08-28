import {Collection, Db, Filter, OptionalId} from "mongodb";
import * as Minio from "minio";
import {Response} from 'node-fetch';
import {CoreLogImpl} from "./CoreLogImpl";
import {CoreSocketApiImpl} from "./CoreSocketApiImpl";
import {CoreDbInnerImpl} from "./CoreDbInnerImpl";
import {CoreInnerImpl} from "./CoreInnerImpl";
import {CoreLibImpl} from "./CoreLibImpl";
import {CoreSimpleDbImpl} from "./CoreSimpleDbImpl";
import {
  AppServerInfo,
  Core,
  CreateRoomRequest,
  DeleteFunc,
  DeleteRoomRequest,
  InsertFunc,
  ServerSetting,
  AddDirectRequest,
  DeleteDataRequest,
  SendDataRequest,
  UpdateDataRequest,
  GetRoomListResponse,
  UploadMediaRequest,
  UploadMediaResponse,
  UpdateFunc,
  RoomLoginRequest,
  UserLoginResponse,
  UserLoginRequest,
  SocketStore,
  DataReference,
  StoreData, ClientUserData
} from "../index";
import {CoreSocketImpl} from "./CoreSocketImpl";
import {TargetClient} from "../_GitHub";

export class SystemCollection {
  constructor(public name: string) { /**/ }
}

export interface CoreSocketApi {
  mediaApiUpload(socket: any, arg: UploadMediaRequest): Promise<UploadMediaResponse>;
  dbApiGet(socket: any, arg: string): Promise<StoreData<unknown>[]>;
  dbApiInsert<T>(
    socket: any,
    arg: AddDirectRequest<T>,
    sendNotify?: boolean,
    nestNum?: number,
    nestNumTotal?: number
  ): Promise<string[]>;
  dbApiDelete(
    socket: any,
    arg: DeleteDataRequest,
    sendNotify?: boolean,
    nestNum?: number,
    nestNumTotal?: number
  ): Promise<void>;
  dbApiUpdate(
    socket: any,
    arg: UpdateDataRequest<any>,
    sendNotify?: boolean,
    nestNum?: number,
    nestNumTotal?: number
  ): Promise<void>;
  socketApiEmitEvent(socket: any, arg: SendDataRequest): Promise<void>;
  roomApiTouchRoom(socket: any, arg: number): Promise<string>;
  roomApiCreateRoom(socket: any, arg: CreateRoomRequest): Promise<ClientUserData[]>;
  roomApiDeleteRoom(socket: any, arg: DeleteRoomRequest): Promise<void>;
  roomApiGetRoomList(socket: any, arg: string): Promise<GetRoomListResponse>;
  roomApiLoginRoom(socket: any, arg: RoomLoginRequest): Promise<ClientUserData[]>;
  roomApiLoginUser(socket: any, arg: UserLoginRequest): Promise<UserLoginResponse>;
}

export interface CoreSocket {
  setEvent<T, U>(
    socket: any,
    func: (core: Core, socket: any, arg: T) => Promise<U>,
    eventName: string,
    resultEventGetter: (arg: T) => string | null
  ): void;
  notifyProgress(socket: any, all: number, current: number): Promise<void>;
  emitSocketEvent<T>(
    socket: any,
    sendTarget: "self" | "room" | "room-mate" | "all" | "other" | "none" | string[],
    event: string,
    error: any,
    payload: T
  ): Promise<void>;
}

export interface CoreSimpleDb {
  addSimple<T>(
    socket: any,
    collectionArg: CollectionArg<StoreData<T>>,
    share: "room" | "room-mate" | "all" | "other" | "none",
    force: boolean,
    isServerInner: boolean,
    data: Partial<StoreData<T>> & { data: T }
  ): Promise<StoreData<T>>;
  deleteSimple<T>(
    socket: any,
    collectionArg: CollectionArg<StoreData<T>>,
    share: "room" | "room-mate" | "all" | "other" | "none",
    key: string
  ): Promise<void>;
  updateSimple<T>(
    socket: any,
    collectionArg: CollectionArg<StoreData<T>>,
    share: "room" | "room-mate" | "all" | "other" | "none",
    data: (Partial<StoreData<Partial<T>>> & { key: string })
  ): Promise<void>
}

export interface CoreLog {
  accessLog(socket: any, eventName: string, category?: string, arg?: any): void;
  accessLogForWebApi(path: string, method: string, authorization: string | undefined): void;
  errorLog(socket: any, eventName: string, message: string): void;
  errorLogForWebApi(path: string, method: string, status: number, message: string): void;
}

export interface CoreLib {
  splitCollectionName(collectionName: string): { cnPrefix: string; cnSuffix: string };
  fetch(url: string): Promise<Response>;
  gatlingAsync<T>(
    promiseList: Promise<T>[],
    socket?: any,
    nestNum?: number,
    nestNumTotal?: number
  ): Promise<T[]>;
  makeKey(): string;
  equals(data1: any, data2: any): boolean;
}

export interface CoreInner {
  deleteExpiredToken(): Promise<number>;
  deleteTouchedRoom(): Promise<number>;
  socketIn(socket: any): Promise<void>;
  socketOut(socket: any): Promise<void>;
}

export interface CoreDbInner {
  dbFindOne<T>(
    filter: Filter<StoreData<T>>,
    collectionArg: CollectionArg<StoreData<T>>
  ): Promise<{ collection: Collection<StoreData<T>>; data: StoreData<T> | null }>;
  dbFindOneRaw<T>(
    filter: Filter<T>,
    collectionArg: CollectionArg<T>
  ): Promise<{ collection: Collection<T>; data: T | null }>;
  dbFind<T>(
    filter: Filter<StoreData<T>>,
    collectionArg: CollectionArg<StoreData<T>>
  ): Promise<{ collection: Collection<StoreData<T>>; dataList: StoreData<T>[] }>;
  dbFindRaw<T>(
    filter: Filter<T>,
    collectionArg: CollectionArg<T>
  ): Promise<{ collection: Collection<T>; dataList: T[] }>;
  getMaxOrder<T>(
    collectionArg: CollectionArg<StoreData<T>>
  ): Promise<{ collection: Collection<StoreData<T>>; maxOrder: number }>;
  addRefList(
    socket: any,
    collection: Collection<StoreData<any>>,
    share: "room" | "room-mate" | "all" | "other" | "none",
    data: StoreData<any> | null | undefined,
    refInfo: { type: string; key: string }
  ): Promise<void>;
  deleteRefList(
    socket: any,
    collection: Collection<StoreData<any>>,
    share: "room" | "room-mate" | "all" | "other" | "none",
    data: StoreData<any> | null | undefined,
    refInfo: { type: string; key: string }
  ): Promise<void>;
  resistCollectionName(collectionName: string): Promise<void>;
  getCollection<T>(arg: CollectionArg<T>, forInsert: boolean): Promise<Collection<T>>;
  getAllReference(
    cnPrefix: string,
    type: string,
    key: string,
    additionalCollectionSuffixList?: string[]
  ): Promise<DataReference[]>;
  getTargetPropertyValueList(data: any, property: string): string[];
  updateMediaKeyRefList<T>(
    socket: any,
    cnPrefix: string,
    share: "room" | "room-mate" | "all" | "other" | "none",
    data: T,
    type: string,
    key: string,
    operation: "add" | "delete" | "update",
    originalData?: T
  ): Promise<void>;
  dbUpdateOne<T>(
    filter: Filter<StoreData<T>>,
    updateData: Partial<StoreData<Partial<T>>>,
    collectionArg: CollectionArg<StoreData<T>>
  ): Promise<Collection<StoreData<T>>>;
  dbUpdateOneRaw<T>(
    filter: Filter<T>,
    updateData: Partial<T>,
    collectionArg: CollectionArg<T>
  ): Promise<Collection<T>>;
  dbDeleteOne(key: string, collectionArg: CollectionArg<StoreData<any>>): Promise<void>;
  dbInsertOne<T>(insertData: StoreData<T>, collectionArg: CollectionArg<StoreData<T>>): Promise<Collection<StoreData<T>>>;
  dbInsertOneRaw<T>(insertData: OptionalId<T>, collectionArg: CollectionArg<T>): Promise<Collection<T>>;
  dbInsert<T>(insertDataList: OptionalId<StoreData<T>>[], collectionArg: CollectionArg<StoreData<T>>): Promise<Collection<StoreData<T>>>;
  dbInsertRaw<T>(insertDataList: OptionalId<T>[], collectionArg: CollectionArg<T>): Promise<Collection<T>>;
  getAllCollection(cnPrefix: string): Promise<string[]>;
  getSocketInfo(socket: any): Promise<{
    socketCollection: Collection<SocketStore>;
    socketInfo: SocketStore
  }>;
  getRoomMateSocketInfoList(socket: any): Promise<{
    socketCollection: Collection<SocketStore>;
    socketInfoList: SocketStore[]
  }>;
}

export type CollectionArg<T> = Collection<T> | SystemCollection | string | [ string, any ];

export class CoreImpl implements Core {
  private static _instance: Core | null = null;
  public static async instance(
    db: Db,
    s3Client: Minio.Client,
    bucket: string,
    accessUrl: string,
    expressServer: any,
    io: any,
    serverSetting: ServerSetting,
    targetVersionInfo: TargetClient,
    appServerInfo: AppServerInfo,
    log4jSettingJsonPath: string,
    insertFuncMap: Map<string, InsertFunc>,
    deleteFuncMap: Map<string, DeleteFunc>,
    updateFuncMap: Map<string, UpdateFunc>
  ): Promise<Core> {
    if (!CoreImpl._instance) {
      CoreImpl._instance = new CoreImpl(
        db,
        bucket,
        accessUrl,
        s3Client,
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
    }
    return CoreImpl._instance;
  }

  public COLLECTION_ROOM: SystemCollection;
  public COLLECTION_TOUCH: SystemCollection;
  public COLLECTION_SOCKET: SystemCollection;
  public COLLECTION_TOKEN: SystemCollection;

  public db: Db;
  public bucket: string;
  public accessUrl: string;
  public s3Client: Minio.Client;
  public expressServer: any
  public io: any;
  public serverSetting: ServerSetting;
  public targetClient: TargetClient;
  public appServerInfo: AppServerInfo;
  public log: CoreLogImpl;
  public socket: CoreSocketImpl;
  public socketApi: CoreSocketApiImpl;
  public lib: CoreLibImpl;
  public _dbInner: CoreDbInnerImpl;
  public _inner: CoreInnerImpl;
  public _simpleDb: CoreSimpleDbImpl;

  private constructor(
    db: Db,
    bucket: string,
    accessUrl: string,
    s3Client: Minio.Client,
    expressServer: any,
    io: any,
    serverSetting: ServerSetting,
    targetClient: TargetClient,
    appServerInfo: AppServerInfo,
    log4jSettingJsonPath: string,
    insertFuncMap: Map<string, InsertFunc>,
    deleteFuncMap: Map<string, DeleteFunc>,
    updateFuncMap: Map<string, UpdateFunc>
  ) {
    this.COLLECTION_ROOM = new SystemCollection(`rooms-${serverSetting.secretCollectionSuffix}`);
    this.COLLECTION_TOUCH = new SystemCollection(`touch-list-${serverSetting.secretCollectionSuffix}`);
    this.COLLECTION_SOCKET = new SystemCollection(`socket-list-${serverSetting.secretCollectionSuffix}`);
    this.COLLECTION_TOKEN = new SystemCollection(`token-list-${serverSetting.secretCollectionSuffix}`);
    this.db = db;
    this.bucket = bucket;
    this.accessUrl = accessUrl;
    this.s3Client = s3Client;
    this.expressServer = expressServer;
    this.io = io;
    this.serverSetting = serverSetting;
    this.targetClient = targetClient;
    this.appServerInfo = appServerInfo;
    this.log = new CoreLogImpl(log4jSettingJsonPath);
    this.socket = new CoreSocketImpl(this);
    this.socketApi = new CoreSocketApiImpl(this, insertFuncMap, deleteFuncMap, updateFuncMap);
    this.lib = new CoreLibImpl(this);
    this._dbInner = new CoreDbInnerImpl(this);
    this._inner = new CoreInnerImpl(this);
    this._simpleDb = new CoreSimpleDbImpl(this);
  }
}
