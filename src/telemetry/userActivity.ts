import { addSpanEvent, getSpan, recordSpanActivity } from './tracing';

// Default inactivity timeout in milliseconds (30 seconds)
const DEFAULT_INACTIVITY_TIMEOUT = 30000;

// Record heartbeat events every 5 seconds to fill in tracing gaps
const HEARTBEAT_INTERVAL = 1000;

// Track user activity in a page with a specific span
export const trackUserActivity = (
  spanId: string,
  inactivityTimeout = DEFAULT_INACTIVITY_TIMEOUT,
  additionalAttributes: () => Record<string, any> = () => ({})
): { 
  startTracking: () => void;
  stopTracking: () => void;
  resetTimer: () => void;
  recordAction: (action: string, attrs?: Record<string, any>) => void;
} => {
  let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let lastActivity = Date.now();
  let isTracking = false;
  
  // Record general user action (clicks, typing, etc.)
  const recordAction = (action: string, attrs: Record<string, any> = {}) => {
    const span = getSpan(spanId);
    if (span && isTracking) {
      addSpanEvent(spanId, `UserAction.${action}`, {
        'action.timestamp': Date.now(),
        'action.time_since_last': Date.now() - lastActivity,
        ...attrs,
        ...additionalAttributes()
      });
      
      // Reset last activity time
      lastActivity = Date.now();
    }
  };
  
  // Event handler for user activity
  const handleUserActivity = () => {
    const now = Date.now();
    const timeSinceLast = now - lastActivity;
    
    // Only record if significant time has passed (100ms) to avoid spam
    if (timeSinceLast > 100 && isTracking) {
      recordSpanActivity(spanId, 'user_interaction', {
        'interaction.time_since_last': timeSinceLast,
        ...additionalAttributes()
      });
    }
    
    lastActivity = now;
    
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }
    
    inactivityTimer = setTimeout(() => {
      const span = getSpan(spanId);
      if (span && isTracking) {
        // Record inactivity event with additional attributes
        addSpanEvent(spanId, 'UserInactivity', {
          'inactivity.duration_ms': inactivityTimeout,
          'inactivity.timestamp': Date.now(),
          ...additionalAttributes()
        });
      }
    }, inactivityTimeout);
  };
  
  // Send heartbeat signals to prevent tracing gaps
  const startHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
    
    heartbeatTimer = setInterval(() => {
      const span = getSpan(spanId);
      if (span && isTracking) {
        const now = Date.now();
        const timeSinceLast = now - lastActivity;
        
        recordSpanActivity(spanId, 'heartbeat', {
          'heartbeat.time': now,
          'user.idle_for_ms': timeSinceLast,
          'user.is_idle': timeSinceLast > inactivityTimeout,
          ...additionalAttributes()
        });
      }
    }, HEARTBEAT_INTERVAL);
  };
  
  const startTracking = () => {
    // Initialize tracking
    lastActivity = Date.now();
    isTracking = true;
    
    // Define events to listen for
    const activityEvents = [
      'click', 'mousemove', 'keypress', 'keydown',
      'scroll', 'touchstart', 'touchmove', 'focus',
      'blur', 'input', 'change'
    ];
    
    // Add event listeners
    activityEvents.forEach(event => {
      document.addEventListener(event, handleUserActivity, { passive: true });
    });
    
    // Record first activity
    recordSpanActivity(spanId, 'tracking_started', {
      'tracking.start_time': lastActivity,
      ...additionalAttributes()
    });
    
    // Set initial inactivity timer
    handleUserActivity();
    
    // Start heartbeat to fill gaps
    startHeartbeat();
    console.info(`Activity tracking started for span: ${spanId}`);
  };
  
  const stopTracking = () => {
    isTracking = false;
    
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
    
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    
    const activityEvents = [
      'click', 'mousemove', 'keypress', 'keydown',
      'scroll', 'touchstart', 'touchmove', 'focus',
      'blur', 'input', 'change'
    ];
    
    activityEvents.forEach(event => {
      document.removeEventListener(event, handleUserActivity);
    });
    
    // Add final activity metrics if span still exists
    if (getSpan(spanId)) {
      const inactiveDuration = Date.now() - lastActivity;
      addSpanEvent(spanId, 'ActivityTrackerStopped', {
        'session.duration_ms': Date.now() - lastActivity,
        'session.last_activity_ms_ago': inactiveDuration,
        ...additionalAttributes()
      });
    }
    console.info(`Activity tracking stopped for span: ${spanId}`);
  };
  
  // Return functions to control activity tracking
  return {
    startTracking,
    stopTracking,
    resetTimer: handleUserActivity,
    recordAction
  };
};