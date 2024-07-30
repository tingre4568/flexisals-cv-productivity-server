const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const auth = require("../middleware/auth");

const secret = "atultingre";

router.post("/signup", async (req, res) => {
  const { name, employeeID, password, dob } = req.body;
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      name,
      employeeID,
      password: hashedPassword,
      dob,
    });
    await newUser.save();
    res.status(201).json({ message: "User successfully registered" });
  } catch (error) {
    if (error.code === 11000) {
      res
        .status(400)
        .json({ message: `Employee ID ${employeeID} is already registered` });
    } else {
      res
        .status(500)
        .json({ message: "Failed to register user. Please try again later." });
    }
  }
});

router.post("/login", async (req, res) => {
  const { employeeID, password } = req.body;
  try {
    const user = await User.findOne({ employeeID });
    if (user && (await bcrypt.compare(password, user.password))) {
      const token = jwt.sign({ id: user._id, name: user.name }, secret);
      res.status(200).json({
        message: "Login successful",
        token,
        name: user.name,
        isAdmin: user.isAdmin,
      });
    } else {
      res.status(400).json({ message: "Invalid employee ID or password" });
    }
  } catch (error) {
    res.status(500).json({ message: "Login failed. Please try again later." });
  }
});

router.post("/forgot_password", async (req, res) => {
  const { employeeID, dob } = req.body;
  try {
    const user = await User.findOne({ employeeID, dob });
    if (user) {
      res
        .status(200)
        .json({ message: "User verification successful", employeeID });
    } else {
      res.status(400).json({ message: "Invalid employee ID or date of birth" });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Password recovery failed. Please try again later." });
  }
});

router.post("/update_password", async (req, res) => {
  const { employeeID, newPassword } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const user = await User.findOneAndUpdate(
      { employeeID },
      { password: hashedPassword }
    );
    if (user) {
      res.status(200).json({ message: "Password updated successfully" });
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to update password. Please try again later." });
  }
});

router.get("/fetch_users", auth, async (req, res) => {
  try {
    const users = await User.find({}, "name employeeID dob");
    res.status(200).json(users);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch users. Please try again later." });
  }
});

router.post("/add_record", auth, async (req, res) => {
  const { date, fileName, companyIVR, directDial, rpcVM, notVerified } =
    req.body;
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const newRecord = {
      date,
      fileName,
      companyIVR,
      directDial,
      rpcVM,
      notVerified,
    };
    user.records.push(newRecord);
    await user.save();
    res.status(201).json({ message: "Record added successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to add record. Please try again later." });
  }
});

router.get("/get_records", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id, "records");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user.records);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to retrieve records. Please try again later." });
  }
});

router.put("/update_record/:recordId", auth, async (req, res) => {
  const { recordId } = req.params;
  const { date, fileName, companyIVR, directDial, rpcVM, notVerified } =
    req.body;
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const record = user.records.id(recordId);
    if (!record) {
      return res.status(404).json({ message: "Record not found" });
    }

    record.date = date || record.date;
    record.fileName = fileName || record.fileName;
    record.companyIVR = companyIVR || record.companyIVR;
    record.directDial = directDial || record.directDial;
    record.rpcVM = rpcVM || record.rpcVM;
    record.notVerified = notVerified || record.notVerified;

    await user.save();
    res.status(200).json({ message: "Record updated successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to update record. Please try again later." });
  }
});

router.delete("/delete_record/:recordId", auth, async (req, res) => {
  const { recordId } = req.params;
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $pull: { records: { _id: recordId } } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const recordRemoved = !user.records.some(
      (record) => record._id.toString() === recordId
    );

    if (recordRemoved) {
      res.status(200).json({ message: "Record deleted successfully" });
    } else {
      res.status(404).json({ message: "Record not found" });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to delete record. Please try again later." });
  }
});

const calculateTotals = (records, startDate, endDate) => {
  const filteredRecords = records.filter((record) => {
    const recordDate = new Date(record.date);
    return recordDate >= startDate && recordDate <= endDate;
  });

  const totals = filteredRecords.reduce(
    (acc, record) => {
      acc.companyIVR += record.companyIVR || 0;
      acc.directDial += record.directDial || 0;
      acc.rpcVM += record.rpcVM || 0;
      acc.notVerified += record.notVerified || 0;
      return acc;
    },
    { companyIVR: 0, directDial: 0, rpcVM: 0, notVerified: 0 }
  );

  totals.grandTotal =
    totals.companyIVR + totals.directDial + totals.rpcVM + totals.notVerified;
  totals.percentage = (totals.directDial / (totals.grandTotal || 1)) * 100;
  totals.productivity =
    (totals.directDial + totals.rpcVM) / (totals.grandTotal || 1);

  return totals;
};

router.get("/totals", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id, "records");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const todayTotals = calculateTotals(user.records, startOfDay, now);
    const weekTotals = calculateTotals(user.records, startOfWeek, now);
    const monthTotals = calculateTotals(user.records, startOfMonth, endOfMonth);

    res.status(200).json({
      today: todayTotals,
      week: weekTotals,
      month: monthTotals,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to retrieve totals. Please try again later." });
  }
});

router.get("/monthly_totals", auth, async (req, res) => {
  try {
    const users = await User.find({}, "name employeeID records");

    const calculateMonthlyTotals = (records) => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const filteredRecords = records.filter((record) => {
        const recordDate = new Date(record.date);
        return (
          recordDate.getFullYear() === now.getFullYear() &&
          recordDate.getMonth() === now.getMonth()
        );
      });

      const totals = filteredRecords.reduce(
        (acc, record) => {
          acc.companyIVR += record.companyIVR || 0;
          acc.directDial += record.directDial || 0;
          acc.rpcVM += record.rpcVM || 0;
          acc.notVerified += record.notVerified || 0;
          return acc;
        },
        { companyIVR: 0, directDial: 0, rpcVM: 0, notVerified: 0 }
      );

      totals.grandTotal =
        totals.companyIVR +
        totals.directDial +
        totals.rpcVM +
        totals.notVerified;
      totals.percentage = (totals.directDial / (totals.grandTotal || 1)) * 100;
      totals.productivity =
        (totals.directDial + totals.rpcVM) / (totals.grandTotal || 1);

      return totals;
    };

    const userTotals = users.map((user) => {
      const monthlyTotals = calculateMonthlyTotals(user.records);
      return {
        name: user.name,
        employeeID: user.employeeID,
        ...monthlyTotals,
      };
    });

    res.status(200).json(userTotals);
  } catch (error) {
    res
      .status(500)
      .json({
        message: "Failed to retrieve monthly totals. Please try again later.",
      });
  }
});

router.get("/user_totals", auth, async (req, res) => {
  try {
    const { period } = req.query;
    const users = await User.find({}, "name employeeID records");

    const now = new Date();
    let startDate,
      endDate = now;

    switch (period) {
      case "daily":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
        break;
      case "weekly":
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - startDate.getDay());
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case "monthly":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      default:
        return res
          .status(400)
          .json({
            message:
              "Invalid period specified. Please choose from daily, weekly, or monthly.",
          });
    }

    const userTotals = users.map((user) => {
      const totals = calculateTotals(user.records, startDate, endDate);
      return {
        name: user.name,
        employeeID: user.employeeID,
        [period]: totals,
      };
    });

    res.status(200).json({ userTotals });
  } catch (error) {
    res
      .status(500)
      .json({
        message: "Failed to retrieve user totals. Please try again later.",
      });
  }
});

module.exports = router;
