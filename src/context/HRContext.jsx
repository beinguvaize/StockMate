import React, { createContext, useContext, useState } from 'react';

const HRContext = createContext();

export const useHR = () => useContext(HRContext);

export const HRProvider = ({ children }) => {
  const [employees, setEmployees] = useState([]);
  const [payrollRecords, setPayrollRecords] = useState([]);

  const value = {
    employees, setEmployees,
    payrollRecords, setPayrollRecords
  };

  return <HRContext.Provider value={value}>{children}</HRContext.Provider>;
};
