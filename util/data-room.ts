import {ApplicationError} from "../error/ApplicationError";
import {
  ClientRoomData,
  ClientUserData,
  Core,
  CreateRoomRequest,
  DeleteRoomRequest,
  GetRoomListResponse,
  MediaStore,
  RoomLoginRequest,
  RoomStore,
  SocketStore,
  StoreData,
  UserLoginRequest,
  UserLoginResponse,
  UserStore
} from "../index";
import {hash, verify} from "../password";
import {compareVersion} from "../_GitHub";
import {SystemError} from "../error/SystemError";
import {Collection} from "mongodb";

export async function roomApiGetRoomListDelegate(
  core: Core,
  socket: any,
  arg: string
): Promise<GetRoomListResponse> {
  try {
    const clientVersion = arg;
    let usable: boolean = false;
    if (core.targetClient.from) {
      if (core.targetClient.to) {
        usable =
          compareVersion(core.targetClient.from, clientVersion) <= 0 &&
          compareVersion(core.targetClient.to, clientVersion) > 0;
      } else {
        usable =
          compareVersion(core.targetClient.from, clientVersion) <= 0;
      }
    }

    let roomList: ClientRoomData[] | null = null;

    if (usable) {
      const {dataList} = await core._dbInner.dbFind<RoomStore>({}, core.COLLECTION_ROOM);

      roomList = dataList.map(d => ({
        roomNo: d.order,
        status: d.status,
        operator: socket.id,
        createDateTime: d.createDateTime,
        updateDateTime: d.updateDateTime,
        detail: d.data ? {
          roomName: d.data.name,
          loggedIn: d.data.loggedIn,
          memberNum: d.data.memberNum,
          extend: d.data.extend
        } : null
      }));
    }
    return {
      roomList,
      maxRoomNo: core.serverSetting.roomNum,
      appServerInfo: core.appServerInfo,
      isNeedRoomCreatePassword: !!core.serverSetting.roomCreatePassword
    };
  } catch (err) {
    throw err;
  }
}

async function roomInitCheckProcess(
  core: Core,
  socket: any,
  roomNo: number,
  socketInfo: SocketStore
): Promise<StoreData<RoomStore> | null> {
  if (socketInfo.userKey) {
    // 入室してたら、退室してもらわないとダメ（正規のクライアントならこの分岐には入らない）
    throw new ApplicationError("You are already logged in to the other room.")
  }
  const {data, collection} = await core._dbInner.dbFindOne<RoomStore>({ order: roomNo }, core.COLLECTION_ROOM);
  if (socketInfo.roomKey) {
    // タッチ後／部屋作成後／部屋ログイン後

    if (!socketInfo.roomCollectionPrefix) {
      // タッチ直後なので部屋データを消す

      const {data: otherRoomData} = await core._dbInner.dbFindOne({key: socketInfo.roomKey}, collection);
      if (otherRoomData) {
        await collection.deleteOne({ key: socketInfo.roomKey });

        // クライアントへの通知
        await core.socket.emitSocketEvent(
          socket,
          "all",
          "notify-room-delete",
          null,
          [otherRoomData.order]
        );
      }
    } else {
      // 部屋作成後／部屋ログイン後
      // 他の人が入室している場合があるので部屋はそのままに、今の部屋の処理を進める
    }
  }
  return data;
}

export async function roomApiTouchRoomDelegate(
  core: Core,
  socket: any,
  arg: number
): Promise<string> {
  // 部屋番号範囲チェック
  const maxRoomNo = core.serverSetting.roomNum;
  if (arg < 1 || maxRoomNo < arg) throw new ApplicationError(`Invalid roomNum ${arg}. (1~${maxRoomNo})`)

  // 既に他の部屋を操作していたら...
  const {socketInfo, socketCollection} = await core._dbInner.getSocketInfo(socket);
  const data = await roomInitCheckProcess(core, socket, arg, socketInfo);

  // 部屋存在チェック
  if (data) throw new ApplicationError("The room is touched.");

  // データなし＝タッチ状態のデータを作成
  const key = core.lib.makeKey();

  await socketCollection.updateOne({ socketId: socket.id }, [{$addFields: {roomKey: key, roomNo: arg, roomCollectionPrefix: null}}]);

  const now = Date.now();
  await core._dbInner.dbInsertOne<null>({
    key,
    collection: "room",
    order: arg,
    refList: [],
    owner: null,
    ownerType: null,
    permission: null,
    status: "initial-touched",
    createDateTime: now,
    updateDateTime: now,
    data: null
  }, core.COLLECTION_ROOM);

  // クライアントへの通知
  await core.socket.emitSocketEvent<ClientRoomData>(
    socket,
    "all",
    "notify-room-update",
    null,
    {
      roomNo: arg,
      status: "initial-touched",
      operator: socket.id,
      createDateTime: now,
      updateDateTime: now,
      detail: null
    }
  );
  return key;
}

export async function roomApiCreateRoomDelegate(
  core: Core,
  socket: any,
  arg: CreateRoomRequest
): Promise<ClientUserData[]> {
  // 既に他の部屋を操作していたら...
  const {socketInfo, socketCollection} = await core._dbInner.getSocketInfo(socket);
  if (socketInfo.userKey) {
    // 入室してたら、退室してもらわないとダメ（正規のクライアントならこの分岐には入らない）
    throw new ApplicationError("You are already logged into the room. (1)")
  }
  if (socketInfo.roomCollectionPrefix) {
    // 入室済みの部屋を作り直すことになっちゃう（正規のクライアントならこの分岐には入らない）
    throw new ApplicationError("You are already logged into the room. (2)")
  }
  if (!socketInfo.roomKey) {
    // タッチしてないのはダメ
    throw new ApplicationError("Not yet touch room.")
  }

  const roomKey = socketInfo.roomKey;

  // 部屋存在チェック
  const { data, collection } = await core._dbInner.dbFindOne<RoomStore>(
    { key: roomKey },
    core.COLLECTION_ROOM
  );
  if (!data) throw new SystemError("Room Not Found. I can only assume that the database is being manipulated directly.");
  if (data.data) throw new SystemError("Already created room. I can only assume that the database is being manipulated directly.");

  const failure = async (message: string): Promise<void> => {
    await core._dbInner.dbDeleteOne(roomKey, collection);

    // クライアントへの通知
    await core.socket.emitSocketEvent(
      socket,
      "all",
      "notify-room-delete",
      null,
      [data.order]
    );
    throw new ApplicationError(message, arg);
  }

  // 部屋作成サーバーパスワード照合
  const roomCreatePassword = core.serverSetting.roomCreatePassword || "";
  if (
    !roomCreatePassword && arg.roomCreatePassword !== undefined ||
    roomCreatePassword && roomCreatePassword !== arg.roomCreatePassword
  ) {
    await failure(`The password to create the room seems to be wrong.`);
  }

  // 平文のパスワードをハッシュ化
  try {
    arg.roomPassword = await hash(arg.roomPassword);
  } catch (err) {
    await failure(`Failure hash.`);
  }

  // 部屋情報を登録
  const roomCollectionPrefix = core.lib.makeKey();
  const storageId = core.lib.makeKey();

  const updateRoomInfo: Partial<StoreData<RoomStore>> = {
    key: roomKey,
    data: {
      name: arg.name,
      bcdiceServer: arg.bcdiceServer,
      bcdiceVersion: arg.bcdiceVersion,
      system: arg.system,
      extend: arg.extend,
      loggedIn: 0,
      memberNum: 0,
      roomCollectionPrefix,
      storageId,
      roomPassword: arg.roomPassword
    },
    status: "added",
    updateDateTime: Date.now()
  };
  try {
    await collection.updateOne({ key: roomKey }, [{ $addFields: updateRoomInfo }]);

    // クライアントへの通知
    await core.socket.emitSocketEvent<ClientRoomData>(
      socket,
      "all",
      "notify-room-update",
      null,
      {
        roomNo: data.order,
        status: data.status,
        operator: socket.id,
        createDateTime: data.createDateTime,
        updateDateTime: updateRoomInfo.updateDateTime!,
        detail: {
          roomName: updateRoomInfo.data!.name,
          loggedIn: updateRoomInfo.data!.loggedIn,
          memberNum: updateRoomInfo.data!.memberNum,
          extend: updateRoomInfo.data!.extend
        }
      }
    );
  } catch (err) {
    console.error(err);
    await failure(`Failure update roomInfo doc.`);
  }

  return login(core, socket, roomCollectionPrefix, roomKey, data.order, storageId, socketCollection);
}

async function login(
  core: Core,
  socket: any,
  cnPrefix: string,
  roomKey: string,
  roomNo: number,
  storageId: string,
  socketCollection: Collection<SocketStore>
): Promise<ClientUserData[]> {
  const updateInfo: Partial<SocketStore> = {
    roomKey,
    roomNo,
    roomCollectionPrefix: cnPrefix,
    storageId
  };

  try {
    await socketCollection.updateOne({ socketId: socket.id }, [{ $addFields: updateInfo }]);
  } catch (err) {
    throw new ApplicationError(`Failure update doc.`, updateInfo);
  }

  // ユーザ一覧を返却
  const {dataList} = await core._dbInner.dbFind<UserStore>({}, ["user-list", cnPrefix]);
  return dataList.map(d => ({
    login: d.data!.login,
    refList: d.refList,
    name: d.data!.name,
    type: d.data!.type
  }));
}

export async function roomApiLoginRoomDelegate(
  core: Core,
  socket: any,
  arg: RoomLoginRequest
): Promise<ClientUserData[]> {
  // 既に他の部屋を操作していたら...
  const {socketInfo, socketCollection} = await core._dbInner.getSocketInfo(socket);
  const data = await roomInitCheckProcess(core, socket, arg.roomNo, socketInfo);

  if (!data) throw new ApplicationError(`No such room.`, arg);
  if (!data.data) throw new ApplicationError(`Not yet created`, arg);

  // 部屋パスワードチェック
  let verifyResult;
  try {
    verifyResult = await verify(data.data.roomPassword!, arg.roomPassword);
  } catch (err) {
    console.error(err);
    throw new SystemError(`Verify process fatal error. room-no=${arg.roomNo}`);
  }
  if (!verifyResult) throw new ApplicationError(`Invalid password.`, arg);

  return login(core, socket, data.data.roomCollectionPrefix, data.key, arg.roomNo, data.data.storageId, socketCollection);
}

export async function roomApiLoginUserDelegate(
  core: Core,
  socket: any,
  arg: UserLoginRequest
): Promise<UserLoginResponse> {
  const {socketInfo, socketCollection} = await core._dbInner.getSocketInfo(socket);
  if (!socketInfo.roomKey) throw new ApplicationError(`You are not logged in to the room yet.`);
  const {data: roomData, collection: roomCollection} = await core._dbInner.dbFindOne<RoomStore>(
    {key: socketInfo.roomKey},
    core.COLLECTION_ROOM
  );

  if (!roomData)
    throw new ApplicationError(`No such room.`, { roomKey: socketInfo.roomKey });

  // ユーザコレクションの取得とユーザ情報更新
  const cnPrefix = roomData.data!.roomCollectionPrefix;
  const {data: userData, collection: userCollection} = await core._dbInner.dbFindOne<UserStore>({ "data.name": arg.name }, ["user-list", cnPrefix]);

  let addLoggedInFlag: boolean = true;
  let addMemberNumFlag: boolean = !userData;

  // リクエスト情報が定義に忠実とは限らないのでチェック
  if (arg.type !== "pl" && arg.type !== "gm" && arg.type !== "visitor")
    arg.type = "visitor";

  let userLoginResponse: UserLoginResponse;
  let userKey: string;

  const notifyUserUpdate = async (userKey: string, userData: StoreData<UserStore>): Promise<void> => {
    await core.socket.emitSocketEvent<ClientUserData>(
      socket,
      "self",
      "notify-user-update",
      null,
      {
        key: userKey,
        refList: userData.refList,
        name: userData.data!.name,
        type: userData.data!.type,
        login: userData.data!.login
      }
    );
    await core.socket.emitSocketEvent<ClientUserData>(
      socket,
      "room-mate",
      "notify-user-update",
      null,
      {
        refList: userData.refList,
        name: userData.data!.name,
        type: userData.data!.type,
        login: userData.data!.login
      }
    );
  }

  if (!userData) {
    console.log("User追加")
    const password = await hash(arg.password);
    const token = core.lib.makeKey();

    const insertedData = await core._simpleDb.addSimple<UserStore>(
      socket,
      userCollection,
      "none",
      true,
      true,
      {
        data: {
          name: arg.name,
          type: arg.type,
          login: 1,
          token,
          password,
          isExported: false
        }
      }
    );

    userKey = insertedData.key;

    // クライアントへの通知
    await notifyUserUpdate(userKey, insertedData);

    userLoginResponse = {
      userKey: insertedData.key,
      token
    };
  } else {
    console.log("User更新")

    // ユーザが存在した場合
    userKey = userData.key;

    userLoginResponse = {
      userKey,
      token: userData.data!.token
    };
    let verifyResult;
    try {
      verifyResult = await verify(userData.data!.password, arg.password);
    } catch (err) {
      throw new SystemError(`Login verify fatal error. user-name=${arg.name}`);
    }

    // パスワードチェックで引っかかった
    if (!verifyResult) throw new ApplicationError(`Invalid password.`, arg);

    // 人数更新
    userData.data!.login++;
    addLoggedInFlag = userData.data!.login === 1;

    await core._simpleDb.updateSimple(socket, userCollection, "none", {
      key: userKey,
      data: {
        login: userData.data!.login
      }
    });

    // クライアントへの通知
    await notifyUserUpdate(userKey, userData);
  }

  await socketCollection.updateOne({ socketId: socket.id }, [{ $addFields: { userKey } }])

  if (addLoggedInFlag) roomData.data!.loggedIn++;
  if (addMemberNumFlag) roomData.data!.memberNum++;
  if (addLoggedInFlag || addMemberNumFlag) {
    const updateDateTime = Date.now();
    await roomCollection.updateOne({key: roomData.key}, [{ $addFields: { // TODO
      data: {
        memberNum: roomData.data!.memberNum,
        loggedIn: roomData.data!.loggedIn
      },
      updateDateTime
    } }]);

    // クライアントへの通知
    await core.socket.emitSocketEvent<ClientRoomData>(
      socket,
      "all",
      "notify-room-update",
      null,
      {
        roomNo: roomData.order,
        status: roomData.status,
        operator: socket.id,
        createDateTime: roomData.createDateTime,
        updateDateTime: updateDateTime,
        detail: {
          roomName: roomData.data!.name,
          loggedIn: roomData.data!.loggedIn,
          memberNum: roomData.data!.memberNum,
          extend: roomData.data!.extend
        }
      }
    );
  }

  return userLoginResponse;
}

export async function roomApiDeleteRoomDelegate(
  core: Core,
  socket: any,
  arg: DeleteRoomRequest
): Promise<void> {
  const { data, collection } = await core._dbInner.dbFindOne<RoomStore>({ order: arg.roomNo }, core.COLLECTION_ROOM);

  if (!data) throw new ApplicationError(`No such room. roomNo: ${arg.roomNo}`);
  if (!data.data) throw new ApplicationError(`Room is creating. roomNo: ${arg.roomNo}`);

  // 部屋パスワードチェック
  let verifyResult: boolean;
  try {
    verifyResult = await verify(data.data.roomPassword!, arg.roomPassword);
  } catch (err) {
    throw new SystemError(`Login verify fatal error. room-no=${arg.roomNo}`);
  }

  if (!verifyResult) throw new ApplicationError("Invalid password.")

  await collection.deleteOne({ key: data.key });

  // クライアントへの通知
  await core.socket.emitSocketEvent(
    socket,
    "all",
    "notify-room-delete",
    null,
    [arg.roomNo]
  );

  const bucket = core.bucket;
  const storageId = data.data.storageId;
  const cnPrefix = data.data.roomCollectionPrefix;

  // メディアコレクションからメディアストレージの削除
  const {dataList} = await core._dbInner.dbFind<MediaStore>({}, ["media-list", cnPrefix]);
  const deleteUrlList = dataList
    .map(d => d.data!.url.replace(core.accessUrl, ""))
    .filter(url => url.startsWith(storageId));
  await core.s3Client.removeObjects(bucket, deleteUrlList);

  // 部屋のコレクションの削除
  await core.lib.gatlingAsync(
    (await core._dbInner.getAllCollection(cnPrefix))
      .map(cnSuffix => `${cnPrefix}-DATA-${cnSuffix}`)
      .map(cnSuffix => core.db.collection(`${cnPrefix}-DATA-${cnSuffix}`).drop())
  );
  await core.db.collection(`${cnPrefix}-DATA-collection-list`).drop();
}
