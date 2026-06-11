// readonly.js — propage le mode "lecture seule" (invité) à toute l'application.
import { createContext, useContext } from "react";

export const ReadOnlyContext = createContext(false);
export const useReadOnly = () => useContext(ReadOnlyContext);
