import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

export const formatIQD = (amount) => {
    const n = Math.round(Number(amount) || 0);
    return `${n.toLocaleString("en-US")} IQD`;
};
