const db = require('../config/database');
const logger = require('../config/logger');
const moment = require('moment');
const { AppError } = require('../utils/errorHandler');

/**
 * Track daily active users
 * @returns {Promise<boolean>} - Success status
 */
const trackDailyActiveUsers = async () => {
  try {
    const today = moment().format('YYYY-MM-DD');

    // Count active users for today
    const [activeUsersResult] = await db.query(
      `SELECT COUNT(DISTINCT user_id) as count 
      FROM user_sessions 
      WHERE DATE(last_active_time) = ?`,
      [today]
    );

    const activeUsers = activeUsersResult.count || 0;

    // Count new users for today
    const [newUsersResult] = await db.query(
      `SELECT COUNT(*) as count 
      FROM users 
      WHERE DATE(created_at) = ?`,
      [today]
    );

    const newUsers = newUsersResult.count || 0;

    // Update or insert analytics
    const [existingRecord] = await db.query(
      'SELECT date FROM analytics_daily_users WHERE date = ?',
      [today]
    );

    if (existingRecord) {
      await db.query(
        'UPDATE analytics_daily_users SET active_users = ?, new_users = ? WHERE date = ?',
        [activeUsers, newUsers, today]
      );
    } else {
      await db.query(
        'INSERT INTO analytics_daily_users (date, active_users, new_users) VALUES (?, ?, ?)',
        [today, activeUsers, newUsers]
      );
    }

    return true;
  } catch (error) {
    logger.error(`Track daily active users error: ${error.message}`);
    return false;
  }
};

/**
 * Track game activity
 * @param {string} gameId - Game ID
 * @returns {Promise<boolean>} - Success status
 */
const trackGameActivity = async (gameId) => {
  try {
    const today = moment().format('YYYY-MM-DD');

    // Get game sessions for today
    const gameSessions = await db.query(
      `SELECT id, started_at, ended_at 
      FROM game_sessions 
      WHERE game_id = ? AND DATE(started_at) = ?`,
      [gameId, today]
    );

    if (gameSessions.length === 0) {
      return true; // No sessions to track
    }

    const sessionsCount = gameSessions.length;

    // Count unique players
    const [playersResult] = await db.query(
      `SELECT COUNT(DISTINCT user_id) as count 
      FROM game_participants 
      WHERE game_session_id IN (
        SELECT id FROM game_sessions 
        WHERE game_id = ? AND DATE(started_at) = ?
      )`,
      [gameId, today]
    );

    const playersCount = playersResult.count || 0;

    // Calculate average session duration
    let totalDuration = 0;
    let completedSessions = 0;

    for (const session of gameSessions) {
      if (session.ended_at) {
        const duration = moment(session.ended_at).diff(moment(session.started_at), 'seconds');
        totalDuration += duration;
        completedSessions++;
      }
    }

    const avgDuration = completedSessions > 0 ? Math.round(totalDuration / completedSessions) : 0;

    // Update or insert analytics
    const [existingRecord] = await db.query(
      'SELECT id FROM analytics_game_activity WHERE game_id = ? AND date = ?',
      [gameId, today]
    );

    if (existingRecord) {
      await db.query(
        `UPDATE analytics_game_activity 
        SET sessions_count = ?, players_count = ?, avg_duration_seconds = ?
        WHERE id = ?`,
        [sessionsCount, playersCount, avgDuration, existingRecord.id]
      );
    } else {
      await db.query(
        `INSERT INTO analytics_game_activity 
        (id, game_id, date, sessions_count, players_count, avg_duration_seconds) 
        VALUES (UUID(), ?, ?, ?, ?, ?)`,
        [gameId, today, sessionsCount, playersCount, avgDuration]
      );
    }

    return true;
  } catch (error) {
    logger.error(`Track game activity error: ${error.message}`);
    return false;
  }
};

/**
 * Track room activity
 * @returns {Promise<boolean>} - Success status
 */
const trackRoomActivity = async () => {
  try {
    const today = moment().format('YYYY-MM-DD');

    // Count rooms created today
    const [roomsCreatedResult] = await db.query(
      `SELECT COUNT(*) as count 
      FROM rooms 
      WHERE DATE(created_at) = ?`,
      [today]
    );

    const roomsCreated = roomsCreatedResult.count || 0;

    // Count active rooms today
    const [activeRoomsResult] = await db.query(
      `SELECT COUNT(DISTINCT room_id) as count 
      FROM room_participants 
      WHERE DATE(joined_at) = ? AND is_active = TRUE`,
      [today]
    );

    const totalActiveRooms = activeRoomsResult.count || 0;

    // Calculate average room duration
    const [durationResult] = await db.query(
      `SELECT AVG(TIMESTAMPDIFF(MINUTE, joined_at, 
          CASE WHEN left_at IS NULL THEN NOW() ELSE left_at END
       )) as avg_duration
      FROM room_participants
      WHERE DATE(joined_at) = ?`,
      [today]
    );

    const avgDurationMinutes = Math.round(durationResult.avg_duration || 0);

    // Calculate max concurrent users
    // This is a simplified approach - for true concurrency you would need
    // to analyze timestamps with more precision
    const [maxConcurrentResult] = await db.query(
      `SELECT COUNT(*) as count
      FROM room_participants
      WHERE DATE(joined_at) = ? AND is_active = TRUE
      GROUP BY room_id
      ORDER BY count DESC
      LIMIT 1`,
      [today]
    );

    const maxConcurrentUsers = maxConcurrentResult ? maxConcurrentResult.count : 0;

    // Update or insert analytics
    const [existingRecord] = await db.query(
      'SELECT id FROM analytics_room_activity WHERE date = ?',
      [today]
    );

    if (existingRecord) {
      await db.query(
        `UPDATE analytics_room_activity 
        SET rooms_created = ?, total_active_rooms = ?, 
        avg_duration_minutes = ?, max_concurrent_users = ?
        WHERE id = ?`,
        [roomsCreated, totalActiveRooms, avgDurationMinutes, maxConcurrentUsers, existingRecord.id]
      );
    } else {
      await db.query(
        `INSERT INTO analytics_room_activity 
        (id, date, rooms_created, total_active_rooms, avg_duration_minutes, max_concurrent_users) 
        VALUES (UUID(), ?, ?, ?, ?, ?)`,
        [today, roomsCreated, totalActiveRooms, avgDurationMinutes, maxConcurrentUsers]
      );
    }

    return true;
  } catch (error) {
    logger.error(`Track room activity error: ${error.message}`);
    return false;
  }
};

/**
 * Get daily active users
 * @param {number} days - Number of days
 * @returns {Promise<Array>} - Daily active users data
 */
const getDailyActiveUsers = async (days = 7) => {
  try {
    // Calculate start date
    const startDate = moment()
      .subtract(days - 1, 'days')
      .format('YYYY-MM-DD');
    const endDate = moment().format('YYYY-MM-DD');

    // Get data from database
    const data = await db.query(
      `SELECT date, active_users, new_users 
      FROM analytics_daily_users 
      WHERE date BETWEEN ? AND ?
      ORDER BY date ASC`,
      [startDate, endDate]
    );

    // Fill in missing dates
    const result = [];
    for (let i = 0; i < days; i++) {
      const date = moment()
        .subtract(days - 1 - i, 'days')
        .format('YYYY-MM-DD');
      const existing = data.find((d) => moment(d.date).format('YYYY-MM-DD') === date);

      if (existing) {
        result.push(existing);
      } else {
        result.push({
          date,
          active_users: 0,
          new_users: 0,
        });
      }
    }

    return result;
  } catch (error) {
    logger.error(`Get daily active users error: ${error.message}`);
    throw new AppError('Failed to get daily active users data', 500);
  }
};

/**
 * Get game activity
 * @param {number} days - Number of days
 * @returns {Promise<Object>} - Game activity data
 */
const getGameActivity = async (days = 7) => {
  try {
    // Calculate start date
    const startDate = moment()
      .subtract(days - 1, 'days')
      .format('YYYY-MM-DD');
    const endDate = moment().format('YYYY-MM-DD');

    // Get games
    const games = await db.query('SELECT id, name FROM games');

    // Get activity data for each game
    const result = await Promise.all(
      games.map(async (game) => {
        const activityData = await db.query(
          `SELECT date, sessions_count, players_count, avg_duration_seconds
        FROM analytics_game_activity
        WHERE game_id = ? AND date BETWEEN ? AND ?
        ORDER BY date ASC`,
          [game.id, startDate, endDate]
        );

        // Fill in missing dates
        const filledData = [];
        for (let i = 0; i < days; i++) {
          const date = moment()
            .subtract(days - 1 - i, 'days')
            .format('YYYY-MM-DD');
          const existing = activityData.find((d) => moment(d.date).format('YYYY-MM-DD') === date);

          if (existing) {
            filledData.push(existing);
          } else {
            filledData.push({
              date,
              sessions_count: 0,
              players_count: 0,
              avg_duration_seconds: 0,
            });
          }
        }

        // Calculate totals
        const totals = {
          sessions_count: activityData.reduce((sum, day) => sum + day.sessions_count, 0),
          players_count: activityData.reduce((sum, day) => sum + day.players_count, 0),
          avg_duration_seconds: Math.round(
            activityData.reduce((sum, day) => sum + day.avg_duration_seconds, 0) /
              (activityData.filter((day) => day.avg_duration_seconds > 0).length || 1)
          ),
        };

        return {
          game_id: game.id,
          game_name: game.name,
          daily_data: filledData,
          totals,
        };
      })
    );

    return result;
  } catch (error) {
    logger.error(`Get game activity error: ${error.message}`);
    throw new AppError('Failed to get game activity data', 500);
  }
};

/**
 * Get room activity
 * @param {number} days - Number of days
 * @returns {Promise<Array>} - Room activity data
 */
const getRoomActivity = async (days = 7) => {
  try {
    // Calculate start date
    const startDate = moment()
      .subtract(days - 1, 'days')
      .format('YYYY-MM-DD');
    const endDate = moment().format('YYYY-MM-DD');

    // Get data from database
    const data = await db.query(
      `SELECT date, rooms_created, total_active_rooms, avg_duration_minutes, max_concurrent_users
      FROM analytics_room_activity
      WHERE date BETWEEN ? AND ?
      ORDER BY date ASC`,
      [startDate, endDate]
    );

    // Fill in missing dates
    const result = [];
    for (let i = 0; i < days; i++) {
      const date = moment()
        .subtract(days - 1 - i, 'days')
        .format('YYYY-MM-DD');
      const existing = data.find((d) => moment(d.date).format('YYYY-MM-DD') === date);

      if (existing) {
        result.push(existing);
      } else {
        result.push({
          date,
          rooms_created: 0,
          total_active_rooms: 0,
          avg_duration_minutes: 0,
          max_concurrent_users: 0,
        });
      }
    }

    return result;
  } catch (error) {
    logger.error(`Get room activity error: ${error.message}`);
    throw new AppError('Failed to get room activity data', 500);
  }
};

module.exports = {
  trackDailyActiveUsers,
  trackGameActivity,
  trackRoomActivity,
  getDailyActiveUsers,
  getGameActivity,
  getRoomActivity,
};
