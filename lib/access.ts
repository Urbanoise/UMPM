"use client";

import { createContext, useContext } from "react";

// Whether this viewer may edit. It only decides which controls to show: proxy.ts
// is what enforces the rule. Read-only is the default, so a component rendered
// outside the provider, or before the session is known, offers no editing.
export const CanEditContext = createContext(false);

export const useCanEdit = () => useContext(CanEditContext);
