import { createContext, useContext } from "react";
import type { AppRouterContext } from "./types";

export const AppDataContext = createContext<AppRouterContext | null>(null);

export function useAppContext() {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error("Missing AppDataContext provider");
  }
  return context;
}
