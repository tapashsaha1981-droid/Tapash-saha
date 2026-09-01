import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API });

export const api = {
  // batches
  listBatches: () => client.get("/batches").then((r) => r.data),
  createBatch: (data) => client.post("/batches", data).then((r) => r.data),
  updateBatch: (id, data) => client.put(`/batches/${id}`, data).then((r) => r.data),
  deleteBatch: (id) => client.delete(`/batches/${id}`).then((r) => r.data),

  // students
  listStudents: () => client.get("/students").then((r) => r.data),
  createStudent: (data) => client.post("/students", data).then((r) => r.data),
  updateStudent: (id, data) => client.put(`/students/${id}`, data).then((r) => r.data),
  moveStudent: (id, batch_id) => client.post(`/students/${id}/move`, { batch_id }).then((r) => r.data),
  deleteStudent: (id) => client.delete(`/students/${id}`).then((r) => r.data),

  // payments
  listPayments: (params = {}) => client.get("/payments", { params }).then((r) => r.data),
  createPayment: (data) => client.post("/payments", data).then((r) => r.data),
  deletePayment: (id) => client.delete(`/payments/${id}`).then((r) => r.data),

  // events
  listEvents: () => client.get("/events").then((r) => r.data),
  createEvent: (data) => client.post("/events", data).then((r) => r.data),
  deleteEvent: (id) => client.delete(`/events/${id}`).then((r) => r.data),

  // export/import
  exportAll: () => client.get("/export").then((r) => r.data),
  importAll: (data) => client.post("/import", data).then((r) => r.data),
  seed: () => client.post("/seed").then((r) => r.data),
  reset: () => client.post("/reset").then((r) => r.data),
};
