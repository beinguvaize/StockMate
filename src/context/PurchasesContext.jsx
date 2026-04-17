import React, { createContext, useContext, useState } from 'react';

const PurchasesContext = createContext();

export const usePurchases = () => useContext(PurchasesContext);

export const PurchasesProvider = ({ children }) => {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  const value = {
    purchases, setPurchases,
    suppliers, setSuppliers
  };

  return <PurchasesContext.Provider value={value}>{children}</PurchasesContext.Provider>;
};
