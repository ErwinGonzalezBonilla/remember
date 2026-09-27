import axios from 'axios'

export const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api'

const api = axios.create({ baseURL: API_URL })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('remember_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export default api
