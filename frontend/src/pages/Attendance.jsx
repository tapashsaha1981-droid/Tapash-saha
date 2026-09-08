import React, { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function Attendance() {
  const [date, setDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [attendance, setAttendance] = useState({});

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Load classes/batches
  useEffect(() => {
    loadBatches();
  }, []);

  // Load students when class changes
  useEffect(() => {
    if (selectedBatch) {
      loadStudents();
    } else {
      setStudents([]);
      setAttendance({});
    }
  }, [selectedBatch]);

  // Load saved attendance when class/date changes
  useEffect(() => {
    if (selectedBatch && date) {
      loadExistingAttendance();
    }
  }, [selectedBatch, date]);

  const loadBatches = async () => {
    try {
      const data = await api.listBatches();
      setBatches(data || []);
    } catch (error) {
      console.error("Error loading batches:", error);
      setMessage("Unable to load classes.");
    }
  };

  const loadStudents = async () => {
    setLoading(true);
    setMessage("");

    try {
      const allStudents = await api.listStudents();

      const filtered = (allStudents || []).filter(
        (student) =>
          String(student.batch_id) === String(selectedBatch)
      );

      setStudents(filtered);

      const initial = {};

      filtered.forEach((student) => {
        initial[student.id] = "present";
      });

      setAttendance(initial);
    } catch (error) {
      console.error("Error loading students:", error);
      setMessage("Unable to load students.");
    } finally {
      setLoading(false);
    }
  };

  const loadExistingAttendance = async () => {
    try {
      const existing = await api.listAttendance({
        date,
        app_class_id: String(selectedBatch),
      });

      const updated = { ...attendance };

      (existing || []).forEach((record) => {
        if (record.app_student_id) {
          updated[record.app_student_id] = record.status;
        }
      });

      setAttendance(updated);
    } catch (error) {
      console.error("Error loading attendance:", error);
    }
  };

  const setStudentStatus = (studentId, status) => {
    setAttendance((previous) => ({
      ...previous,
      [studentId]: status,
    }));
  };

  const markAllPresent = () => {
    const updated = {};

    students.forEach((student) => {
      updated[student.id] = "present";
    });

    setAttendance(updated);
  };

  const markAllAbsent = () => {
    const updated = {};

    students.forEach((student) => {
      updated[student.id] = "absent";
    });

    setAttendance(updated);
  };

  const saveAttendance = async () => {
    if (!selectedBatch) {
      setMessage("Please select a class first.");
      return;
    }

    if (!students.length) {
      setMessage("No students found in this class.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const records = students.map((student) => ({
        app_student_id: String(student.id),
        app_class_id: String(selectedBatch),
        date,
        status: attendance[student.id] || "present",
      }));

      await api.saveAttendance(records);

      setMessage("Attendance saved successfully.");
    } catch (error) {
      console.error("Error saving attendance:", error);

      const detail =
        error?.response?.data?.detail ||
        "Unable to save attendance.";

      setMessage(detail);
    } finally {
      setSaving(false);
    }
  };

  const presentCount = students.filter(
    (student) => attendance[student.id] === "present"
  ).length;

  const absentCount = students.filter(
    (student) => attendance[student.id] === "absent"
  ).length;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Attendance</h1>

          <p style={styles.subtitle}>
            Mark student attendance
          </p>
        </div>
      </div>

      <div style={styles.controls}>
        <div style={styles.field}>
          <label style={styles.label}>Date</label>

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Select Class</label>

          <select
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
            style={styles.input}
          >
            <option value="">Select a class</option>

            {batches.map((batch) => (
              <option
                key={batch.id}
                value={batch.id}
              >
                {batch.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {message && (
        <div style={styles.message}>
          {message}
        </div>
      )}

      {selectedBatch && students.length > 0 && (
        <div style={styles.summary}>
          <div style={styles.summaryItem}>
            <strong>{students.length}</strong>
            <span>Total</span>
          </div>

          <div style={styles.summaryItem}>
            <strong>{presentCount}</strong>
            <span>Present</span>
          </div>

          <div style={styles.summaryItem}>
            <strong>{absentCount}</strong>
            <span>Absent</span>
          </div>
        </div>
      )}

      {selectedBatch && students.length > 0 && (
        <div style={styles.quickActions}>
          <button
            type="button"
            onClick={markAllPresent}
            style={styles.quickButton}
          >
            Mark All Present
          </button>

          <button
            type="button"
            onClick={markAllAbsent}
            style={styles.quickButton}
          >
            Mark All Absent
          </button>
        </div>
      )}

      {loading ? (
        <div style={styles.empty}>
          Loading students...
        </div>
      ) : !selectedBatch ? (
        <div style={styles.empty}>
          Select a class to see students.
        </div>
      ) : students.length === 0 ? (
        <div style={styles.empty}>
          No students found in this class.
        </div>
      ) : (
        <>
          <div style={styles.list}>
            {students.map((student, index) => {
              const status =
                attendance[student.id] || "present";

              return (
                <div
                  key={student.id}
                  style={styles.studentRow}
                >
                  <div style={styles.studentInfo}>
                    <div style={styles.number}>
                      {index + 1}
                    </div>

                    <div>
                      <div style={styles.studentName}>
                        {student.name}
                      </div>

                      {student.phone && (
                        <div style={styles.phone}>
                          {student.phone}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={styles.buttons}>
                    <button
                      type="button"
                      onClick={() =>
                        setStudentStatus(
                          student.id,
                          "present"
                        )
                      }
                      style={{
                        ...styles.statusButton,
                        ...(status === "present"
                          ? styles.presentActive
                          : {}),
                      }}
                    >
                      Present
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setStudentStatus(
                          student.id,
                          "absent"
                        )
                      }
                      style={{
                        ...styles.statusButton,
                        ...(status === "absent"
                          ? styles.absentActive
                          : {}),
                      }}
                    >
                      Absent
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={saveAttendance}
            disabled={saving}
            style={styles.saveButton}
          >
            {saving ? "Saving..." : "Save Attendance"}
          </button>
        </>
      )}
    </div>
  );
}

const styles = {
  page: {
    padding: "24px",
    maxWidth: "1100px",
    margin: "0 auto",
  },

  header: {
    marginBottom: "24px",
  },

  title: {
    margin: 0,
    fontSize: "28px",
    fontWeight: 700,
  },

  subtitle: {
    marginTop: "6px",
    color: "#6b7280",
  },

  controls: {
    display: "flex",
    gap: "16px",
    flexWrap: "wrap",
    marginBottom: "20px",
  },

  field: {
    display: "flex",
    flexDirection: "column",
    gap: "7px",
    minWidth: "220px",
  },

  label: {
    fontSize: "14px",
    fontWeight: 600,
  },

  input: {
    padding: "11px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    background: "#fff",
    fontSize: "15px",
  },

  message: {
    padding: "12px 14px",
    marginBottom: "16px",
    borderRadius: "8px",
    background: "#f3f4f6",
  },

  summary: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    marginBottom: "16px",
  },

  summaryItem: {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    minWidth: "90px",
    padding: "12px 16px",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    background: "#fff",
  },

  quickActions: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    marginBottom: "16px",
  },

  quickButton: {
    padding: "9px 14px",
    border: "1px solid #d1d5db",
    borderRadius: "7px",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  },

  empty: {
    padding: "40px 20px",
    textAlign: "center",
    color: "#6b7280",
  },

  list: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },

  studentRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    padding: "14px",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    background: "#fff",
  },

  studentInfo: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },

  number: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f3f4f6",
    fontWeight: 600,
  },

  studentName: {
    fontWeight: 600,
  },

  phone: {
    fontSize: "13px",
    color: "#6b7280",
    marginTop: "3px",
  },

  buttons: {
    display: "flex",
    gap: "8px",
  },

  statusButton: {
    padding: "9px 14px",
    border: "1px solid #d1d5db",
    borderRadius: "7px",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  },

  presentActive: {
    background: "#dcfce7",
    borderColor: "#22c55e",
  },

  absentActive: {
    background: "#fee2e2",
    borderColor: "#ef4444",
  },

  saveButton: {
    marginTop: "22px",
    width: "100%",
    padding: "13px 18px",
    border: "none",
    borderRadius: "8px",
    background: "#6c55f5",
    color: "#fff",
    fontSize: "16px",
    fontWeight: 700,
    cursor: "pointer",
  },
};
