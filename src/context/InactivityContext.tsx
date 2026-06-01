import React, { createContext, useContext, useState, ReactNode } from 'react';

interface InactivityContextType {
  locked: boolean;
  setLocked: (locked: boolean) => void;
}

const InactivityContext = createContext<InactivityContextType | undefined>(undefined);

export function InactivityProvider({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(true);

  return (
    <InactivityContext.Provider value={{ locked, setLocked }}>
      {children}
    </InactivityContext.Provider>
  );
}

export function useInactivity() {
  const context = useContext(InactivityContext);
  if (context === undefined) {
    throw new Error('useInactivity must be used within an InactivityProvider');
  }
  return context;
}
