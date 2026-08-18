// State Management
const appState = {
  session: null,
  activeScreen: 'booking', // 'booking' or 'detail'
  qrOverlayActive: false,
};

// Constant Ticket Values matching user requests
const TICKET_DETAILS = {
  ticketNumber: "7101000122901250",
  fareTotal: "₹ 15.0",
  fareDiscount: "₹ 3.0",
  fareAmount: "₹ 12.0",
  netPayable: "₹ 12.0",
  passengerAdult: "1",
  passengerTotal: "1"
};

const SESSION_STORAGE_KEY = 'brts_ticket_session_v6';

// DOM Elements for QR codes
let qrInstance = null;
let qrEnlargedInstance = null;

// Initialize app when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  initSession();
  
  // Start the master tick loop (runs every real-world second)
  setInterval(masterTick, 1000);
  
  // Initial draw
  masterTick();
});

/* ==========================================
   SESSION & TIME LOGIC
   ========================================== */

// Calculate the ticket details (transaction time and route directions)
// depending on whether the current time is for the morning or evening shift.
function getTicketDetailsForTime(now) {
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  
  const morningTimeInMinutes = 9 * 60 + 7;      // 09:07 AM
  const eveningTimeInMinutes = 18 * 60 + 23;    // 06:23 PM (6:23 PM)
  
  let txnDate = new Date(now);
  let routeType = 'morning';
  
  if (timeInMinutes < morningTimeInMinutes) {
    // Before 09:07 AM: show yesterday's evening ticket (6:23 PM)
    txnDate.setDate(txnDate.getDate() - 1);
    txnDate.setHours(18, 23, 0, 0);
    routeType = 'evening';
  } else if (timeInMinutes < eveningTimeInMinutes) {
    // Between 09:07 AM and 06:23 PM: show today's morning ticket (09:07 AM)
    txnDate.setHours(9, 7, 0, 0);
    routeType = 'morning';
  } else {
    // After 06:23 PM: show today's evening ticket (6:23 PM)
    txnDate.setHours(18, 23, 0, 0);
    routeType = 'evening';
  }
  
  const route = {
    full: routeType === 'morning'
      ? "AMROLI CHAR RASTA <span class=\"to-text\">TO</span> UDHANA DARWAJA BRTS"
      : "UDHANA DARWAJA BRTS <span class=\"to-text\">TO</span> AMROLI CHAR RASTA",
    short: routeType === 'morning'
      ? "AMROLI CHAR RASTA &rarr; UDHANA DARWAJA BRTS"
      : "UDHANA DARWAJA BRTS &rarr; AMROLI CHAR RASTA"
  };
  
  return {
    txnTime: txnDate.getTime(),
    route: route
  };
}

// Initialize session from LocalStorage or create a fresh one
function initSession() {
  const stored = localStorage.getItem(SESSION_STORAGE_KEY);
  const now = new Date();
  
  if (stored) {
    try {
      appState.session = JSON.parse(stored);
      const remaining = appState.session.expiryTime - now.getTime();
      const currentDetails = getTicketDetailsForTime(now);
      
      // Recreate session if expired OR if the simulated purchase time/date/route has shifted
      if (remaining <= 0 || appState.session.startTime !== currentDetails.txnTime) {
        createNewSession(now);
      }
    } catch (e) {
      console.error("Error parsing stored session", e);
      createNewSession(now);
    }
  } else {
    createNewSession(now);
  }
}

// Create a new ticket session with a 2-hour looping timer and dynamic route
function createNewSession(now) {
  const details = getTicketDetailsForTime(now);
  const duration = 2 * 60 * 60 * 1000; // 2 hours in ms
  
  appState.session = {
    startTime: details.txnTime,
    duration: duration,
    expiryTime: now.getTime() + duration, // 2 hours countdown from now
    ticketNumber: TICKET_DETAILS.ticketNumber,
    orderId: generateOrderId(new Date(details.txnTime)),
    route: details.route
  };
  
  saveSession();
  generateQRCodes();
}

function saveSession() {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(appState.session));
}

/* ==========================================
   TICK LOOP & UI UPDATER
   ========================================== */

function masterTick() {
  const now = new Date();
  
  if (!appState.session) return;
  
  let remainingMs = appState.session.expiryTime - now.getTime();
  
  // Auto-reset when the countdown reaches 00:00:00
  if (remainingMs <= 0) {
    const duration = 2 * 60 * 60 * 1000; // 2 hours
    const details = getTicketDetailsForTime(now);
    
    appState.session = {
      startTime: details.txnTime,
      duration: duration,
      expiryTime: now.getTime() + duration, // Reset expiry to 2 hours from now
      ticketNumber: TICKET_DETAILS.ticketNumber,
      orderId: generateOrderId(new Date(details.txnTime)),
      route: details.route
    };
    saveSession();
    remainingMs = duration;
  }
  
  // Update all texts and timers on screens
  updateUI(now, remainingMs);
}

// Update all DOM elements
function updateUI(now, remainingMs) {
  if (!appState.session) return;
  
  const session = appState.session;
  const txnDate = new Date(session.startTime);
  const expDate = new Date(session.startTime + 2 * 60 * 60 * 1000); // Ticket expiration displays as 2hr after txn
  
  // Format strings
  const txnStr = formatFullDateTime(txnDate);
  const expStr = formatFullDateTime(expDate);
  
  // Booking Card elements (Screen 1)
  document.getElementById('card-txn-time').textContent = txnStr;
  document.getElementById('card-exp-time').textContent = expStr;
  document.getElementById('card-order-id').textContent = session.orderId;
  document.getElementById('card-ticket-number').textContent = session.ticketNumber;
  
  // Update dynamic route displays
  document.getElementById('card-route-text').innerHTML = session.route.full;
  document.getElementById('detail-route-short').innerHTML = session.route.short;
  
  // Status indicator is ALWAYS Active (in green)
  const activeIndicator = document.querySelector('.active-indicator');
  activeIndicator.innerHTML = '<span>Active</span>';
  activeIndicator.className = 'card-col align-right text-green bold active-indicator';
  
  // Detail elements (Screen 2)
  document.getElementById('detail-ticket-number-label').textContent = session.ticketNumber;
  document.getElementById('detail-ticket-number-sub').textContent = session.ticketNumber;
  document.getElementById('overlay-ticket-number').textContent = session.ticketNumber;
  
  document.getElementById('detail-txn-date').textContent = formatShortDate(txnDate);
  document.getElementById('detail-txn-time').textContent = formatTimeOnly(txnDate);
  
  // Set Countdown display
  const countdownTimerEl = document.getElementById('countdown-timer');
  countdownTimerEl.textContent = formatCountdown(remainingMs);
  
  // Initialize QR codes if they don't exist yet
  if (!qrInstance) {
    generateQRCodes();
  }
}

/* ==========================================
   ROUTING & OVERLAYS
   ========================================== */

function navigateToDetail() {
  document.getElementById('booking-screen').classList.remove('active');
  document.getElementById('payment-details-screen').classList.add('active');
  appState.activeScreen = 'detail';
}

function navigateToBooking() {
  document.getElementById('payment-details-screen').classList.remove('active');
  document.getElementById('booking-screen').classList.add('active');
  appState.activeScreen = 'booking';
}

function toggleQROverlay() {
  const overlay = document.getElementById('qr-overlay');
  appState.qrOverlayActive = !appState.qrOverlayActive;
  if (appState.qrOverlayActive) {
    overlay.classList.add('active');
  } else {
    overlay.classList.remove('active');
  }
}

// Generate client side QR codes using QRCode.js CDN
function generateQRCodes() {
  const ticketNum = appState.session ? appState.session.ticketNumber : TICKET_DETAILS.ticketNumber;
  
  document.getElementById("qrcode").innerHTML = "";
  document.getElementById("qrcode-enlarged").innerHTML = "";
  
  qrInstance = new QRCode(document.getElementById("qrcode"), {
    text: ticketNum,
    width: 180,
    height: 180,
    colorDark : "#000000",
    colorLight : "#ffffff",
    correctLevel : QRCode.CorrectLevel.H
  });

  qrEnlargedInstance = new QRCode(document.getElementById("qrcode-enlarged"), {
    text: ticketNum,
    width: 230,
    height: 230,
    colorDark : "#000000",
    colorLight : "#ffffff",
    correctLevel : QRCode.CorrectLevel.H
  });
}

/* ==========================================
   FORMATTING & UTILITY FUNCTIONS
   ========================================== */

// Helper: Format date as DD/MM/YYYY HH:MM:SS
function formatFullDateTime(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
}

// Helper: Format date as DD/MM/YY
function formatShortDate(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

// Helper: Format time as HH:MM:SS
function formatTimeOnly(date) {
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${min}:${ss}`;
}

// Helper: Generate order ID matching the pattern YYYYMMDDHHMMSS0001250 based on date
function generateOrderId(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${min}${ss}0001250`;
}

// Helper: Format milliseconds into spaced string 'HH : MM : SS'
function formatCountdown(ms) {
  if (ms <= 0) {
    return '02 : 00 : 00';
  }
  
  const totalSecs = Math.floor(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;
  
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  
  return `${hh} : ${mm} : ${ss}`;
}
