// readonly.js — propage le mode "lecture seule" (invité) à toute l'application.
// Les composants qui ont des boutons d'écriture appellent useReadOnly() et les masquent si true.
import { createContext, useContext } from "react";

export const ReadOnlyContext = createContext(false);
export const useReadOnly = () => useContext(ReadOnlyContext);
