import {
  AddDirectRequest,
  ClientUserData,
  DeleteDataRequest,
  GetRoomListResponse,
  RoomLoginRequest,
  SendDataRequest,
  StoreData,
  UpdateDataRequest,
  UploadMediaRequest,
  UploadMediaResponse,
  UserLoginRequest,
  UserLoginResponse
} from "../index";
import {CoreSocketApi} from "./index";
import {Core, CreateRoomRequest, DeleteFunc, DeleteRoomRequest, InsertFunc, UpdateFunc} from "../index";
import {dbApiDeleteDelegate, dbApiGetDelegate, dbApiInsertDelegate, dbApiUpdateDelegate} from "../_MongoDb";
import {mediaApiUploadDelegate} from "../_Minio";
import {
  roomApiCreateRoomDelegate,
  roomApiDeleteRoomDelegate,
  roomApiGetRoomListDelegate,
  roomApiLoginRoomDelegate,
  roomApiLoginUserDelegate,
  roomApiTouchRoomDelegate
} from "../util/data-room";

export class CoreSocketApiImpl implements CoreSocketApi {
  public constructor(
    private core: Core,
    private insertFuncMap: Map<string, InsertFunc>,
    private deleteFuncMap: Map<string, DeleteFunc>,
    private updateFuncMap: Map<string, UpdateFunc>
  ) {}

  public async socketApiEmitEvent(socket: any, arg: SendDataRequest): Promise<void> {
    await this.core.socket.emitSocketEvent(socket, arg.target, arg.event, arg.error, arg.data);
  }

  public async roomApiTouchRoom(socket: any, arg: number): Promise<string> {
    return roomApiTouchRoomDelegate(this.core, socket, arg);
  }

  public async roomApiCreateRoom(socket: any, arg: CreateRoomRequest): Promise<ClientUserData[]> {
    return roomApiCreateRoomDelegate(this.core, socket, arg);
  }

  public async roomApiDeleteRoom(socket: any, arg: DeleteRoomRequest): Promise<void> {
    return roomApiDeleteRoomDelegate(this.core, socket, arg);
  }

  public async roomApiGetRoomList(socket: any, arg: string): Promise<GetRoomListResponse> {
    return roomApiGetRoomListDelegate(this.core, socket, arg);
  }

  public async roomApiLoginRoom(socket: any, arg: RoomLoginRequest): Promise<ClientUserData[]> {
    return roomApiLoginRoomDelegate(this.core, socket, arg);
  }

  public async roomApiLoginUser(socket: any, arg: UserLoginRequest): Promise<UserLoginResponse> {
    return roomApiLoginUserDelegate(this.core, socket, arg);
  }

  public async mediaApiUpload(socket: any, arg: UploadMediaRequest): Promise<UploadMediaResponse> {
    return mediaApiUploadDelegate(this.core, socket, arg);
  }

  public async dbApiGet(socket: any, arg: string): Promise<StoreData<unknown>[]> {
    return dbApiGetDelegate(this.core, socket, arg);
  }

  public async dbApiInsert<T>(
    socket: any,
    arg: AddDirectRequest<T>,
    sendNotify?: boolean,
    nestNum?: number,
    nestNumTotal?: number
  ): Promise<string[]> {
    return await dbApiInsertDelegate
      .bind(null, this.core, this.insertFuncMap)
      .bind(null, socket, arg, sendNotify, nestNum, nestNumTotal)();
  }

  public async dbApiDelete(
    socket: any,
    arg: DeleteDataRequest,
    sendNotify?: boolean,
    nestNum?: number,
    nestNumTotal?: number
  ): Promise<void> {
    return await dbApiDeleteDelegate
      .bind(null, this.core, this.deleteFuncMap)
      .bind(null, socket, arg, sendNotify, nestNum, nestNumTotal)();
  }

  public async dbApiUpdate(
    socket: any,
    arg: UpdateDataRequest<any>,
    sendNotify?: boolean,
    nestNum?: number,
    nestNumTotal?: number
  ): Promise<void> {
    return await dbApiUpdateDelegate
      .bind(null, this.core, this.updateFuncMap)
      .bind(null, socket, arg, sendNotify, nestNum, nestNumTotal)();
  }
}
