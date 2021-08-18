type UserType = "gm" | "pl" | "visitor";

type UserLoginRequest = {
  name: string;
  password: string;
  type?: UserType;
};

type UserLoginResponse = {
  userKey: string;
  token: string;
}

type DeleteFileRequest = {
  urlList: string[];
};

type UploadMediaInfo = MediaStore & { key?: string } & (
  | { dataLocation: "direct" }
  | {
  dataLocation: "server";
  blob?: Blob;
  arrayBuffer?: string;
}
  );

type DiceInfo = {
  type: string;
  label: string;
  pips: { [P: string]: string };
};
type DiceMaterial = { [P: string]: DiceInfo[] };

type LikeStore = {
  char: string;
  isThrowLinkage: boolean;
  linkageResourceKey: string | null;
};

type OriginalTableStore = {
  commandName: string;
  diceRoll: string;
  tableTitle: string;
  tableContents: {
    [key in string]: string;
  };
  bcdiceServer: string | null;
  bcdiceVersion: string | null;
  system: string; // yamlファイルには未記載。プログラムで設定する変数。
};

type AddRoomPresetDataRequest = {
  roomName: string;
  bcdiceServer: string; // BCDiceサーバー
  bcdiceVersion: string; // BCDiceAPIバージョン
  system: string; // BCDiceSystem
  roomExtendInfo: RoomInfoExtend;
  sceneData: SceneStore;
  cutInDataList: CutInStore[];
  diceMaterial: DiceMaterial,
  likeList: LikeStore[],
  originalTableList: OriginalTableStore[];
  language: {
    mainChatTabName: string;
    allGroupChatTabName: string;
    nameLabel: string;
  };
};

type ImportRequest = {
  [importLevel in ImportLevel]: StoreData<any>[];
};
