import React, { createContext, useContext, useState } from 'react';

const NotificationContext = createContext();

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  const addNotification = (message, type = 'success') => {
    const id = `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setNotifications(prev => [{ id, message, type, date: new Date().toISOString() }, ...prev].slice(0, 5));
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const value = {
    notifications,
    addNotification
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};
