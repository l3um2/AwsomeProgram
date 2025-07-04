"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROUTE_JSON_PATH = exports.POOL_LIST_PATH = exports.MAX_OPTIMAL_BUY_SOL = exports.MIN_OPTIMAL_BUY_SOL = exports.EXPECTED_TOKEN_MULTIPLIER = exports.ARBITRAGE_THRESHOLD = exports.WALLET_PRIVATE_KEY = exports.TOKEN = exports.ENDPOINT = exports.RPC_URL = void 0;
// config/index.ts
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
// .env 파일 로드
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
// 환경 변수 불러오기 (필수값은 !, 기본값 제공 가능)
exports.RPC_URL = process.env.RPC_ENDPOINT;
exports.ENDPOINT = process.env.ENDPOINT;
exports.TOKEN = process.env.TOKEN;
exports.WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
// 차익 감시 기준
exports.ARBITRAGE_THRESHOLD = parseFloat(process.env.ARBITRAGE_THRESHOLD || '3');
exports.EXPECTED_TOKEN_MULTIPLIER = parseFloat(process.env.EXPECTED_TOKEN_MULTIPLIER || '0.9');
// 최적 매수 SOL 범위
exports.MIN_OPTIMAL_BUY_SOL = parseFloat(process.env.MIN_OPTIMAL_BUY_SOL || '0.001');
exports.MAX_OPTIMAL_BUY_SOL = parseFloat(process.env.MAX_OPTIMAL_BUY_SOL || '0.01');
// 데이터 파일 경로
exports.POOL_LIST_PATH = path_1.default.join(__dirname, '../data/poollist.json');
exports.ROUTE_JSON_PATH = path_1.default.join(__dirname, '../data/route.json');
