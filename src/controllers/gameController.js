const { validationResult } = require('express-validator');
const { catchAsync, AppError } = require('../utils/errorHandler');
const gameService = require('../services/gameService');
const logger = require('../config/logger');
const { uploadMediaToCloudinary, deleteMediaFromCloudinary } = require('../middleware/cloudinary');

/**
 * Create game
 */
const createGame = catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array(),
    });
  }

  const isGameExists = await gameService.checkGameExists(req.body.name);

  if (isGameExists) {
    throw new AppError('Game already exists', 400);
  }
  let result;
  if (req.file) {
    result = await uploadMediaToCloudinary(req.file, 'gameDocs');
  }
  const { public_id = null, url = null } = result || {};

  const gameObj = {
    ...req.body,
    rules: url,
    rules_id: public_id,
  };

  const games = await gameService.createGames(gameObj);

  res.status(201).json({
    status: 'success',
    data: games,
    message: 'Games created successfully',
  });
});

/**
 * Update game
 */
const updateGame = catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array(),
    });
  }

  const isGameExists = await gameService.getGameById(req.params.game_id);

  if (!isGameExists) {
    throw new AppError('Game Not Exits', 400);
  }

  const gameObj = {
    ...req.body,
  };

  if (req.file) {
    const { rules_id } = isGameExists;
    if (rules_id) {
      await deleteMediaFromCloudinary(rules_id);
    }
    const result = await uploadMediaToCloudinary(req.file, 'gameDocs');
    const { public_id = null, url = null } = result || {};
    if (public_id) gameObj.rules = url;
    if (url) gameObj.rules_id = public_id;
  }

  const games = await gameService.updateGame(req.params.game_id, gameObj);

  res.status(200).json({
    status: 'success',
    data: games,
    message: 'Game updated successfully',
  });
});

/**
 * Delete game
 */
const deleteGame = catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array(),
    });
  }
  const isGameExists = await gameService.getGameById(req.params.game_id);

  if (!isGameExists) {
    throw new AppError('Game Not Exits', 400);
  }

  const { rules_id } = isGameExists;
  if (rules_id) {
    await deleteMediaFromCloudinary(rules_id);
  }

  await gameService.deleteGame(req.params.game_id);
  res.status(200).json({
    status: 'success',
    message: 'Game deleted successfully',
  });
});

/**
 * Get all games
 */
const getGames = catchAsync(async (req, res) => {
  const games = await gameService.getGames();

  res.status(200).json({
    status: 'success',
    data: {
      games,
      count: games.length,
    },
  });
});

/**
 * Get game by ID
 */
const getGameById = catchAsync(async (req, res) => {
  const { game_id } = req.params;

  const game = await gameService.getGameById(game_id);

  res.status(200).json({
    status: 'success',
    data: {
      game,
    },
  });
});

/**
 * Create game session
 */
const createGameSession = catchAsync(async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array(),
    });
  }

  const sessionData = {
    gameId: req.body.game_id,
    roomId: req.body.room_id,
    createdBy: req.user.id,
  };

  const session = await gameService.createGameSession(sessionData);

  res.status(201).json({
    status: 'success',
    data: {
      session,
    },
    message: 'Game session created successfully',
  });
});

/**
 * Get game session
 */
const getGameSession = catchAsync(async (req, res) => {
  const { session_id } = req.params;

  const session = await gameService.getGameSession(session_id);

  res.status(200).json({
    status: 'success',
    data: {
      session,
    },
  });
});

/**
 * Join game session
 */
const joinGameSession = catchAsync(async (req, res) => {
  const { session_id } = req.params;

  const session = await gameService.joinGameSession(session_id, req.user.id);

  res.status(200).json({
    status: 'success',
    data: {
      session,
    },
    message: 'Joined game session successfully',
  });
});

/**
 * Leave game session
 */
const leaveGameSession = catchAsync(async (req, res) => {
  const { session_id } = req.params;

  await gameService.leaveGameSession(session_id, req.user.id);

  res.status(200).json({
    status: 'success',
    message: 'Left game session successfully',
  });
});

/**
 * End game session
 */
const endGameSession = catchAsync(async (req, res) => {
  const { session_id } = req.params;

  await gameService.endGameSession(session_id, req.user.id);

  res.status(200).json({
    status: 'success',
    message: 'Game session ended successfully',
  });
});

/**
 * Update player score
 */
const updatePlayerScore = catchAsync(async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array(),
    });
  }

  const { session_id, user_id } = req.params;
  const { score } = req.body;

  const result = await gameService.updatePlayerScore(session_id, user_id, score);

  res.status(200).json({
    status: 'success',
    data: {
      player: result,
    },
    message: 'Player score updated successfully',
  });
});

/**
 * Get active game sessions in room
 */
const getActiveGameSessionsInRoom = catchAsync(async (req, res) => {
  const { room_id } = req.params;

  const sessions = await gameService.getActiveGameSessionsInRoom(room_id);

  res.status(200).json({
    status: 'success',
    data: {
      sessions,
      count: sessions.length,
    },
  });
});

/**
 * Invite user to game
 */
const inviteToGame = catchAsync(async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array(),
    });
  }

  const { session_id } = req.params;
  const { user_id } = req.body;

  await gameService.inviteToGame(session_id, req.user.id, user_id);

  res.status(200).json({
    status: 'success',
    message: 'Game invitation sent successfully',
  });
});

module.exports = {
  createGame,
  updateGame,
  deleteGame,
  getGames,
  getGameById,
  createGameSession,
  getGameSession,
  joinGameSession,
  leaveGameSession,
  endGameSession,
  updatePlayerScore,
  getActiveGameSessionsInRoom,
  inviteToGame,
};
