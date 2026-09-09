import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { openWhatsApp } from "../lib/calc";

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
  const [showAbsentPopup, setShowAbsentPopup] = useState(false);

  useEffect(() => {
    loadBatches();
  }, []);

  useEffect(() => {
    if (selectedBatch) {
      loadStudents();
    } else {
      setStudents([]);
      setAttendance({});
    }
  }, [selectedBatch]);

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
    setShowAbsentPopup(false);
  };

  const markAllAbsent = () => {
    const updated = {};

    students.forEach((student) => {
      updated[student.id] = "absent";
    });

    setAttendance(updated);
  };

  const absenceMessage = (student) => {
    const formattedDate = new Date(
      `${date}T00:00:00`
    ).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    return `Dear Parent,

This is to inform you that ${student.name} was absent from class on ${formattedDate}.

প্রিয় অভিভাবক,

আপনাকে জানানো যাচ্ছে যে ${student.name} ${formattedDate} তারিখে ক্লাসে অনুপস্থিত ছিল।

Please contact TAPASH SIR if you have any questions.
কোনো প্রশ্ন থাকলে TAPASH SIR-এর সঙ্গে যোগাযোগ করুন।

Thank you.
ধন্যবাদ।`;
  };

  const getParentWhatsApp = (student) => {
    return (
      student.parent_phone ||
      student.guardian_whatsapp ||
      ""
    );
  };

  const sendAbsentWhatsApp = (student) => {
    const phone = getParentWhatsApp(student);

    if (!phone) {
      setMessage(
        `${student.name}: Parent WhatsApp number is not available.`
      );
      return;
    }

    openWhatsApp(
      phone,
      absenceMessage(student)
    );
  };

  const absentStudents = students.filter(
    (student) =>
      attendance[student.id] === "absent"
  );

  const absentWithWhatsApp = absentStudents.filter(
    (student) =>
      getParentWhatsApp(student)
  );

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
        status:
          attendance[student.id] || "present",
      }));

      await api.saveAttendance(records);

      setMessage(
        "Attendance saved successfully."
      );
    } catch (error) {
      console.error(
        "Error saving attendance:",
        error
      );

      const detail =
        error?.response?.data?.detail ||
        "Unable to save attendance.";

      setMessage(detail);
    } finally {
      setSaving(false);
    }
  };

  const presentCount = students.filter(
    (student) =>
      attendance[student.id] === "present"
  ).length;

  const absentCount = students.filter(
    (student) =>
      attendance[student.id] === "absent"
  ).length;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>
            Attendance
          </h1>

          <p style={styles.subtitle}>
            Mark student attendance
          </p>
        </div>
      </div>

      <div style={styles.controls}>
        <div style={styles.field}>
          <label style={styles.label}>
            Date
          </label>

          <input
            type="date"
            value={date}
            onChange={(e) =>
              setDate(e.target.value)
            }
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>
            Select Class
          </label>

          <select
            value={selectedBatch}
            onChange={(e) =>
              setSelectedBatch(e.target.value)
            }
            style={styles.input}
          >
            <option value="">
              Select a class
            </option>

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

      {selectedBatch &&
        students.length > 0 && (
          <div style={styles.summary}>
            <div style={styles.summaryItem}>
              <strong>
                {students.length}
              </strong>
              <span>Total</span>
            </div>

            <div style={styles.summaryItem}>
              <strong>
                {presentCount}
              </strong>
              <span>Present</span>
            </div>

            <div style={styles.summaryItem}>
              <strong>
                {absentCount}
              </strong>
              <span>Absent</span>
            </div>
          </div>
        )}

      {selectedBatch &&
        students.length > 0 && (
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

            {absentCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  setShowAbsentPopup(true)
                }
                style={styles.remindButton}
              >
                💬 Remind All Absent
              </button>
            )}
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
                attendance[student.id] ||
                "present";

              const parentWhatsApp =
                getParentWhatsApp(student);

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
                      <div
                        style={
                          styles.studentName
                        }
                      >
                        {student.name}
                      </div>

                      {parentWhatsApp ? (
                        <div
                          style={styles.phone}
                        >
                          📱 Parent WhatsApp:{" "}
                          {parentWhatsApp}
                        </div>
                      ) : (
                        <div
                          style={
                            styles.noPhone
                          }
                        >
                          📱 Parent WhatsApp:
                          Not available
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
                        ...(status ===
                        "present"
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
                        ...(status ===
                        "absent"
                          ? styles.absentActive
                          : {}),
                      }}
                    >
                      Absent
                    </button>

                    {status === "absent" &&
                      parentWhatsApp && (
                        <button
                          type="button"
                          onClick={() =>
                            sendAbsentWhatsApp(
                              student
                            )
                          }
                          style={
                            styles.whatsappButton
                          }
                        >
                          💬 WhatsApp
                        </button>
                      )}
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
            {saving
              ? "Saving..."
              : "Save Attendance"}
          </button>
        </>
      )}

      {showAbsentPopup && (
        <div style={styles.overlay}>
          <div style={styles.popup}>
            <div
              style={styles.popupHeader}
            >
              <div>
                <h2
                  style={
                    styles.popupTitle
                  }
                >
                  💬 Absent Students
                </h2>

                <p
                  style={
                    styles.popupSubtitle
                  }
                >
                  Send WhatsApp reminders
                  one by one.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowAbsentPopup(false)
                }
                style={styles.closeButton}
              >
                ✕
              </button>
            </div>

            {absentStudents.length ===
            0 ? (
              <div
                style={styles.popupEmpty}
              >
                No absent students.
              </div>
            ) : (
              <div
                style={styles.popupList}
              >
                {absentStudents.map(
                  (student, index) => {
                    const phone =
                      getParentWhatsApp(
                        student
                      );

                    return (
                      <div
                        key={student.id}
                        style={
                          styles.popupStudent
                        }
                      >
                        <div>
                          <strong>
                            {index + 1}.{" "}
                            {student.name}
                          </strong>

                          <div
                            style={
                              phone
                                ? styles.popupPhone
                                : styles.popupNoPhone
                            }
                          >
                            {phone
                              ? "WhatsApp number available"
                              : "WhatsApp number not available"}
                          </div>
                        </div>

                        {phone ? (
                          <button
                            type="button"
                            onClick={() =>
                              sendAbsentWhatsApp(
                                student
                              )
                            }
                            style={
                              styles.popupWhatsApp
                            }
                          >
                            💬 Send
                          </button>
                        ) : (
                          <span
                            style={
                              styles.noNumber
                            }
                          >
                            No number
                          </span>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            )}

            <div
              style={styles.popupFooter}
            >
              <span>
                {absentWithWhatsApp.length}{" "}
                parent
                {absentWithWhatsApp.length !==
                1
                  ? "s"
                  : ""}{" "}
                can be contacted
              </span>

              <button
                type="button"
                onClick={() =>
                  setShowAbsentPopup(false)
                }
                style={styles.doneButton}
              >
                Done
              </button>
            </div>
          </div>
        </div>
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

  remindButton: {
    padding: "9px 14px",
    border: "none",
    borderRadius: "7px",
    background: "#25D366",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
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
    minWidth: 0,
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
    flexShrink: 0,
  },

  studentName: {
    fontWeight: 600,
  },

  phone: {
    fontSize: "13px",
    color: "#6b7280",
    marginTop: "3px",
  },

  noPhone: {
    fontSize: "13px",
    color: "#ef4444",
    marginTop: "3px",
  },

  buttons: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    justifyContent: "flex-end",
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

  whatsappButton: {
    padding: "9px 14px",
    border: "none",
    borderRadius: "7px",
    background: "#25D366",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
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

  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    zIndex: 9999,
  },

  popup: {
    width: "100%",
    maxWidth: "600px",
    maxHeight: "85vh",
    overflowY: "auto",
    background: "#fff",
    borderRadius: "14px",
    padding: "20px",
    boxShadow:
      "0 20px 50px rgba(0,0,0,0.2)",
  },

  popupHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    marginBottom: "18px",
  },

  popupTitle: {
    margin: 0,
    fontSize: "21px",
  },

  popupSubtitle: {
    margin: "5px 0 0",
    color: "#6b7280",
    fontSize: "14px",
  },

  closeButton: {
    width: "34px",
    height: "34px",
    border: "none",
    borderRadius: "50%",
    background: "#f3f4f6",
    cursor: "pointer",
    fontSize: "16px",
  },

  popupList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },

  popupStudent: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "13px",
    border: "1px solid #e5e7eb",
    borderRadius: "9px",
  },

  popupPhone: {
    marginTop: "4px",
    fontSize: "12px",
    color: "#16a34a",
  },

  popupNoPhone: {
    marginTop: "4px",
    fontSize: "12px",
    color: "#ef4444",
  },

  popupWhatsApp: {
    padding: "8px 12px",
    border: "none",
    borderRadius: "7px",
    background: "#25D366",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
    flexShrink: 0,
  },

  noNumber: {
    fontSize: "12px",
    color: "#ef4444",
  },

  popupEmpty: {
    padding: "30px",
    textAlign: "center",
    color: "#6b7280",
  },

  popupFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    marginTop: "18px",
    paddingTop: "15px",
    borderTop: "1px solid #e5e7eb",
    fontSize: "13px",
    color: "#6b7280",
  },

  doneButton: {
    padding: "8px 16px",
    border: "1px solid #d1d5db",
    borderRadius: "7px",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  },
};
