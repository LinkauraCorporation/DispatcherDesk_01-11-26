import React, { createContext, useContext, useState, useEffect } from 'react';
import { DEFAULT_DISPATCHER_TIMEZONE, DEFAULT_OPERATIONAL_TIMEZONE, getCurrentTimeInZone } from '../lib/timezones.ts';

interface TimezoneContextType {
  operationalTimezone: string; // The US/Canada operations zone (e.g. America/Chicago)
  dispatcherTimezone: string;  // The Dispatcher's local zone (e.g. Asia/Kolkata)
  setOperationalTimezone: (tz: string) => void;
  setDispatcherTimezone: (tz: string) => void;
  liveOpsTime: string;
  liveDispatcherTime: string;
}

const TimezoneContext = createContext<TimezoneContextType | undefined>(undefined);

export const TimezoneProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [operationalTimezone, setOperationalTimezoneState] = useState<string>(() => {
    return localStorage.getItem('dispatchdesk_ops_tz') || DEFAULT_OPERATIONAL_TIMEZONE;
  });

  const [dispatcherTimezone, setDispatcherTimezoneState] = useState<string>(() => {
    return localStorage.getItem('dispatchdesk_disp_tz') || DEFAULT_DISPATCHER_TIMEZONE;
  });

  const [liveOpsTime, setLiveOpsTime] = useState<string>('');
  const [liveDispatcherTime, setLiveDispatcherTime] = useState<string>('');

  const setOperationalTimezone = (tz: string) => {
    setOperationalTimezoneState(tz);
    localStorage.setItem('dispatchdesk_ops_tz', tz);
  };

  const setDispatcherTimezone = (tz: string) => {
    setDispatcherTimezoneState(tz);
    localStorage.setItem('dispatchdesk_disp_tz', tz);
  };

  // Update clock every second
  useEffect(() => {
    const updateTimes = () => {
      setLiveOpsTime(getCurrentTimeInZone(operationalTimezone));
      setLiveDispatcherTime(getCurrentTimeInZone(dispatcherTimezone));
    };

    updateTimes();
    const interval = setInterval(updateTimes, 1000);
    return () => clearInterval(interval);
  }, [operationalTimezone, dispatcherTimezone]);

  return (
    <TimezoneContext.Provider
      value={{
        operationalTimezone,
        dispatcherTimezone,
        setOperationalTimezone,
        setDispatcherTimezone,
        liveOpsTime,
        liveDispatcherTime,
      }}
    >
      {children}
    </TimezoneContext.Provider>
  );
};

export const useTimezone = () => {
  const context = useContext(TimezoneContext);
  if (!context) {
    throw new Error('useTimezone must be used within a TimezoneProvider');
  }
  return context;
};
