export type NoodleProfileConnection = "followers" | "following";

export type NoodleNavigationState =
  | { mode: "public"; view: "home" }
  | { mode: "public"; view: "search" }
  | { mode: "public"; view: "notifications" }
  | {
      mode: "public";
      view: "profile";
      accountId: string | null;
      connection: NoodleProfileConnection | null;
    }
  | { mode: "noodler"; view: "hub" }
  | { mode: "noodler"; view: "profiles" }
  | { mode: "noodler"; view: "profile"; accountId: string }
  | { mode: "noodler"; view: "create-profile"; noodleAccountId: string }
  | { mode: "verification" }
  | { mode: "settings" };
