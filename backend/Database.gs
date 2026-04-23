/**
 * Database Management for FoodiePin
 */

const DB_SHEETS = {
  TREND_LOG: 'Trend_Log',
  USERS: 'Users',
  USER_BOOKMARKS: 'User_Bookmarks'
};

function getSpreadsheet() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID not set in Script Properties');
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

/**
 * Initialize the database structure if it doesn't exist.
 */
function setupDatabase() {
  const ss = getSpreadsheet();
  
  // Sheet1: Trend_Log
  if (!ss.getSheetByName(DB_SHEETS.TREND_LOG)) {
    const sheet = ss.insertSheet(DB_SHEETS.TREND_LOG);
    sheet.appendRow(['Timestamp', 'Name', 'City', 'Category', 'Clue', 'Source']);
    sheet.setFrozenRows(1);
  }
  
  // Sheet2: Users
  if (!ss.getSheetByName(DB_SHEETS.USERS)) {
    const sheet = ss.insertSheet(DB_SHEETS.USERS);
    sheet.appendRow(['User_ID', 'Email', 'Password_Hash', 'Created_At']);
    sheet.setFrozenRows(1);
  }
  
  // Sheet3: User_Bookmarks
  if (!ss.getSheetByName(DB_SHEETS.USER_BOOKMARKS)) {
    const sheet = ss.insertSheet(DB_SHEETS.USER_BOOKMARKS);
    sheet.appendRow(['Bookmark_ID', 'User_ID', 'Timestamp', 'Name', 'City', 'Category', 'Maps_URL']);
    sheet.setFrozenRows(1);
  }
  
  return "Database setup complete.";
}

/**
 * Helper to get sheet by name
 */
function getSheet(name) {
  return getSpreadsheet().getSheetByName(name);
}

/**
 * Find user by email
 */
function findUserByEmail(email) {
  const sheet = getSheet(DB_SHEETS.USERS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === email) {
      return {
        id: data[i][0],
        email: data[i][1],
        hash: data[i][2]
      };
    }
  }
  return null;
}

/**
 * Add new user
 */
function addUser(id, email, hash) {
  const sheet = getSheet(DB_SHEETS.USERS);
  sheet.appendRow([id, email, hash, new Date()]);
}

/**
 * Log trend (anonymous)
 */
function logTrend(name, city, category, clue, source) {
  const sheet = getSheet(DB_SHEETS.TREND_LOG);
  sheet.appendRow([new Date(), name, city, category, clue, source]);
}

/**
 * Add bookmark
 */
function addBookmark(userId, name, city, category, mapsUrl) {
  const sheet = getSheet(DB_SHEETS.USER_BOOKMARKS);
  const bookmarkId = Utilities.getUuid();
  sheet.appendRow([bookmarkId, userId, new Date(), name, city, category, mapsUrl]);
  return bookmarkId;
}

/**
 * Get all bookmarks for a user
 */
function getBookmarksForUser(userId) {
  const sheet = getSheet(DB_SHEETS.USER_BOOKMARKS);
  const data = sheet.getDataRange().getValues();
  const results = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === userId) {
      results.push({
        id: data[i][0],
        timestamp: data[i][2],
        name: data[i][3],
        city: data[i][4],
        category: data[i][5],
        mapsUrl: data[i][6]
      });
    }
  }
  return results;
}
