import React, { createContext, useContext, useState } from 'react';

const FinanceContext = createContext();

export const useFinance = () => useContext(FinanceContext);

export const FinanceProvider = ({ children }) => {
  const [expenses, setExpenses] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState(['Petrol', 'Food', 'Salary', 'Rent', 'Electricity', 'Water', 'Maintenance', 'Stationery', 'Travel', 'Marketing', 'Tax', 'Others']);
  const [dayBook, setDayBook] = useState([]);

  const value = {
    expenses, setExpenses,
    expenseCategories, setExpenseCategories,
    dayBook, setDayBook
  };

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
};
