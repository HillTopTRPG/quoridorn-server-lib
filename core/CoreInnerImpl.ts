import {ApplicationError} from "../error/ApplicationError";
import {CoreInner} from "./index";
import {ClientRoomData, ClientUserData, Core, RoomStore, SocketStore, StoreData, TokenStore, UserStore} from "../index";

export class CoreInnerImpl implements CoreInner {
  public constructor(private core: Core) {}

  public async deleteExpiredToken(): Promise<number> {
    const collection = await this.core._dbInner.getCollection<TokenStore>(this.core.COLLECTION_TOKEN, false);
    const result = await collection.deleteMany({ expires: { $lt: new Date() } });
    return result.deletedCount;
  }

  public async deleteTouchedRoom(): Promise<number> {
    const collection = await this.core._dbInner.getCollection<StoreData<RoomStore>>(this.core.COLLECTION_ROOM, false);
    const d = new Date();
    d.setMinutes(d.getMinutes() - 5);
    const result = await collection.deleteMany({ $and: [{createTime: { $lt: d }}, {data: null}] });
    return result.deletedCount;
  }

  public async socketIn(socket: any): Promise<void> {
    await this.core._dbInner.dbInsertOneRaw<SocketStore>({
        socketId: socket.id,
        roomKey: null,
        roomNo: null,
        roomCollectionPrefix: null,
        storageId: null,
        userKey: null,
        connectTime: new Date()
      },
      this.core.COLLECTION_SOCKET
    )
  }

  public async socketOut(socket: any): Promise<void> {
    const {socketInfo, socketCollection} = await this.core._dbInner.getSocketInfo(socket);

    if (socketInfo.roomKey && socketInfo.userKey) {
      const {
        data: roomInfo,
        collection: roomCollection
      } = await this.core._dbInner.dbFindOne<RoomStore>({ key: socketInfo.roomKey }, this.core.COLLECTION_ROOM);

      if (!roomInfo)
        throw new ApplicationError(`No such room. room-key=${socketInfo.roomKey}`);

      // ログアウト処理
      const {
        data: userInfo,
        collection: userCollection
      } = await this.core._dbInner.dbFindOne<UserStore>({ key: socketInfo.userKey }, ["user-list", roomInfo.data!.roomCollectionPrefix!]);

      if (!userInfo)
        throw new ApplicationError(`No such user. user-key=${socketInfo.userKey}`);

      userInfo.data!.login--;

      const updateUserInfo = { key: socketInfo.userKey, data: {login: userInfo.data!.login} };
      await this.core._simpleDb.updateSimple(
        socket,
        userCollection,
        "room-mate",
        updateUserInfo
      );

      // クライアントへの通知
      await this.core.socket.emitSocketEvent<ClientUserData>(
        socket,
        "room-mate",
        "notify-user-update",
        null,
        {
          refList: userInfo.refList,
          name: userInfo.data!.name,
          type: userInfo.data!.type,
          login: userInfo.data!.login
        }
      );

      if (userInfo.data!.login === 0) {
        const updateRoomInfo = { data: { memberNum: roomInfo.data!.memberNum } };
        roomInfo.data!.memberNum--;
        await roomCollection.updateOne(
          { key: socketInfo.roomKey },
          [{ $addFields: updateRoomInfo }]
        );

        // クライアントへの通知
        await this.core.socket.emitSocketEvent<ClientRoomData>(
          socket,
          "all",
          "notify-room-update",
          null,
          {
            roomNo: roomInfo.order,
            status: roomInfo.status,
            operator: socket.id,
            detail: {
              roomName: roomInfo.data!.name,
              memberNum: roomInfo.data!.memberNum,
              extend: roomInfo.data!.extend
            }
          }
        );
      }
    }

    await socketCollection.deleteOne({ socketId: socket.id });
  }
}
