"use client";

import dynamic from "next/dynamic";
import type { MapProps } from "./map-inner";

export type { MapMarker, MapProps } from "./map-inner";

// Leaflet touches `window` at import time, so it must never render on the server.
export const Map = dynamic(() => import("./map-inner"), {
  ssr: false,
  loading: () => <div className="h-full min-h-[200px] w-full animate-pulse rounded-xl bg-slate-100" />,
}) as React.ComponentType<MapProps>;
