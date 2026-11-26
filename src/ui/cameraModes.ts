/** Camera presets shared by the 3D arena and the broadcast window. */
export type CameraMode = "broadcast" | "overhead" | "follow" | "close" | "stands";
export const CAMERA_MODES: { value: CameraMode; ru: string; en: string }[] = [
  { value: "broadcast", ru: "Трансляция", en: "Broadcast" },
  { value: "follow", ru: "За шайбой", en: "Follow puck" },
  { value: "close", ru: "Крупный план", en: "Close-up" },
  { value: "overhead", ru: "Тактическая", en: "Tactical" },
  { value: "stands", ru: "Трибуна", en: "From the stands" },
];
