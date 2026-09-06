export type AdminPeer = { name: string };

export type AdminPadRow = {
  id: string;
  title: string;
  difficulty: string;
  language: string;
  prompt: string;
  owner: { id: string; name: string; email: string } | null;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  livePeers: AdminPeer[];
};

export type AdminPerson = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  lastSeenAt: string | null;
  padCount: number;
  latestPad: { id: string; title: string; updatedAt: string } | null;
};

export type AdminLiveRoom = {
  id: string;
  title: string;
  ownerName: string | null;
  peers: AdminPeer[];
  updatedAt: string;
};

export type AdminInsights = {
  generatedAt: number;
  stats: {
    users: number;
    pads: number;
    liveNow: number;
    activeToday: number;
  };
  people: AdminPerson[];
  pads: AdminPadRow[];
  liveRooms: AdminLiveRoom[];
};
