import {ApplicationError} from "../error/ApplicationError";
import {
  ClientRoomData,
  Core,
  CreateRoomRequest,
  DeleteRoomRequest,
  GetRoomListResponse,
  MediaStore,
  RoomLoginRequest,
  RoomLoginResponse,
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

export async function roomApiDeleteRoomDelegate(
  core: Core,
  socket: any,
  arg: DeleteRoomRequest
): Promise<void> {
  const { data, collection } = await core._dbInner.dbFindOne<RoomStore>({ order: arg.roomNo }, core.COLLECTION_ROOM);

  if (!data) throw new ApplicationError(`No such room. roomNo: ${arg.roomNo}`);
  if (data.status === "initial-touched") throw new ApplicationError(`Room is creating. roomNo: ${arg.roomNo}`);

  // 部屋パスワードチェック
  let verifyResult: boolean;
  try {
    verifyResult = await verify(data.data!.roomPassword!, arg.roomPassword);
  } catch (err) {
    throw new SystemError(`Login verify fatal error. room-no=${arg.roomNo}`);
  }

  if (!verifyResult) throw new ApplicationError("Invalid password.")

  await collection.deleteOne({ key: data.key });
  await core.socket.emitSocketEvent(
    socket,
    "all",
    "notify-room-delete",
    null,
    data.order
  );

  const bucket = core.bucket;
  const storageId = data.data!.storageId;
  const cnPrefix = data.data!.roomCollectionPrefix;

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

export async function roomApiLoginUserDelegate(
  core: Core,
  socket: any,
  arg: UserLoginRequest
): Promise<UserLoginResponse> {
  const {socketInfo, socketCollection} = await core._dbInner.getSocketInfo(socket);
  if (!socketInfo.roomKey) throw new ApplicationError(`Not yet login.`, arg);
  const {data: roomData, collection: roomCollection} = await core._dbInner.dbFindOne<RoomStore>(
    {key: socketInfo.roomKey},
    core.COLLECTION_ROOM
  );

  if (!roomData)
    throw new ApplicationError(`No such room.`, { roomKey: socketInfo.roomKey });

  // ユーザコレクションの取得とユーザ情報更新
  const cnPrefix = roomData.data!.roomCollectionPrefix;
  const {data: userData, collection: userCollection} = await core._dbInner.dbFindOne<UserStore>({ data: { name: arg.name} }, ["user-list", cnPrefix]);

  let addRoomMember: boolean = true;

  // リクエスト情報が定義に忠実とは限らないのでチェック
  if (arg.type !== "pl" && arg.type !== "gm" && arg.type !== "visitor")
    arg.type = "visitor";

  let userLoginResponse: UserLoginResponse;

  if (!userData) {
    const password = await hash(arg.password);
    const token = core.lib.makeKey();

    const addedData = await core._simpleDb.addSimple(socket, userCollection, "room", true, {
      data: {
        name: arg.name,
        type: arg.type,
        token,
        password,
        login: 1,
        isExported: false
      }
    });

    userLoginResponse = {
      userKey: addedData.key,
      token
    };
  } else {
    // ユーザが存在した場合
    const userKey = userData.key;

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
    addRoomMember = userData.data!.login === 1;

    await core._simpleDb.updateSimple(socket, userCollection, "room", {
      key: userKey,
      data: {
        login: userData.data!.login
      }
    });

    await socketCollection.updateOne({ socketId: socket.id }, {
      userKey
    })
  }

  if (addRoomMember) {
    // ログインできたので部屋の入室人数を更新
    roomData.data!.memberNum++;

    await roomCollection.updateOne({key: roomData.key}, {
      data: {
        memberNum: roomData.data!.memberNum
      }
    });
  }

  return userLoginResponse;
}


export async function roomApiLoginRoomDelegate(
  core: Core,
  socket: any,
  arg: RoomLoginRequest
): Promise<RoomLoginResponse> {
  const {data} = await core._dbInner.dbFindOne<RoomStore>({ order: arg.roomNo }, core.COLLECTION_ROOM);
  if (!data) throw new ApplicationError(`No such room.`, arg);
  if (!data.data) throw new ApplicationError(`Not yet created`, arg);

  // 部屋パスワードチェック
  let verifyResult;
  try {
    verifyResult = await verify(data.data.roomPassword!, arg.roomPassword);
  } catch (err) {
    throw new SystemError(`Verify process fatal error. room-no=${arg.roomNo}`);
  }

  if (!verifyResult) throw new ApplicationError(`Invalid password.`, arg);

  const socketCollection = await core._dbInner.getCollection<SocketStore>(core.COLLECTION_SOCKET, false);
  const cnPrefix = data.data.roomCollectionPrefix;
  const updateInfo: Partial<SocketStore> = {
    roomKey: data.key,
    roomNo: data.order,
    roomCollectionPrefix: cnPrefix,
    storageId: data.data.storageId
  };

  try {
    await socketCollection.updateOne({ socketId: socket.id }, updateInfo);
  } catch (err) {
    throw new ApplicationError(`Failure update doc.`, updateInfo);
  }

  const {dataList} = await core._dbInner.dbFind<UserStore>({}, ["user-list", cnPrefix]);
  return dataList.map(d => ({userName: d.data!.name}));
}

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
        detail: d.data ? {
          roomName: d.data.name,
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


export async function roomApiCreateRoomDelegate(
  core: Core,
  socket: any,
  arg: CreateRoomRequest
): Promise<void> {
  const { data, collection } = await core._dbInner.dbFindOne<RoomStore>(
    { key: arg.roomKey },
    core.COLLECTION_ROOM
  );
  if (!data) throw new ApplicationError("Not yet touch.");
  if (data.data) throw new ApplicationError("Already created room.");

  const failure = async (message: string): Promise<void> => {
    await core._dbInner.dbDeleteOne(arg.roomKey, collection);
    await core.socket.emitSocketEvent(
      socket,
      "all",
      "notify-room-delete",
      null,
      data.order
    );
    throw new ApplicationError(message, arg);
  }

  const roomCreatePassword = core.serverSetting.roomCreatePassword || "";
  if (
    !roomCreatePassword && arg.roomCreatePassword !== undefined ||
    roomCreatePassword && roomCreatePassword !== arg.roomCreatePassword
  ) {
    return failure(`The password to create the room seems to be wrong.`);
  }

  // リクエスト情報の加工
  try {
    arg.roomPassword = await hash(arg.roomPassword);
  } catch (err) {
    return failure(`Failure hash.`);
  }

  const roomCollectionPrefix = core.lib.makeKey();
  const storageId = core.lib.makeKey();

  // 部屋情報の更新
  const storeData: RoomStore = {
    name: arg.name,
    bcdiceServer: arg.bcdiceServer,
    bcdiceVersion: arg.bcdiceVersion,
    system: arg.system,
    extend: arg.extend,
    memberNum: 0,
    roomCollectionPrefix,
    storageId,
    roomPassword: arg.roomPassword
  };

  const updateRoomInfo: Partial<StoreData<RoomStore>> = {
    key: arg.roomKey,
    data: storeData,
    status: "added",
    updateTime: new Date()
  };
  try {
    await collection.updateOne({ key: arg.roomKey }, updateRoomInfo);

    await core.socket.emitSocketEvent<ClientRoomData>(
      socket,
      "all",
      "notify-room-update",
      null,
      {
        roomNo: data.order,
        status: data.status,
        operator: socket.id,
        detail: {
          roomName: storeData.name,
          memberNum: storeData.memberNum,
          extend: storeData.extend
        }
      }
    );
  } catch (err) {
    await failure(`Failure update roomInfo doc.`);
  }

  const socketCollection = await core._dbInner.getCollection(core.COLLECTION_SOCKET, false);
  await socketCollection.updateOne({ socketId: socket.id }, {
    roomKey: arg.roomKey,
    roomNo: data.order,
    roomCollectionPrefix,
    storageId
  });
}


export async function roomApiTouchRoomDelegate(
  core: Core,
  socket: any,
  arg: number
): Promise<string> {
  const {data} = await core._dbInner.dbFindOne<RoomStore>({order: arg}, core.COLLECTION_ROOM);
  if (data) throw new ApplicationError("The room is touched.");
  const key = core.lib.makeKey();
  await core._dbInner.dbInsertOne<null>({
    key,
    collection: "room",
    order: arg,
    refList: [],
    owner: null,
    ownerType: null,
    permission: null,
    status: "initial-touched",
    createTime: new Date(),
    updateTime: null,
    data: null
  }, core.COLLECTION_ROOM);

  await core.socket.emitSocketEvent<ClientRoomData>(
    socket,
    "all",
    "notify-room-update",
    null,
    {
      roomNo: arg,
      status: "initial-touched",
      operator: socket.id,
      detail: null
    }
  );
  return key;
}
