import mongoose from 'mongoose';

// ✅ MESSAGE SCHEMA - for conversation history
const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

// ✅ BOOKING SCHEMA - for confirmed booking details
const bookingSchema = new mongoose.Schema(
  {
    confirmedServiceDate: {
      type: String,
      default: null,
    },
    confirmedServiceDateISO: {
      type: Date,
      default: null,
    },
    assignedBranchCity: {
      type: String,
      default: null,
    },
    assignedBranchName: {
      type: String,
      default: null,
    },
    assignedBranchCode: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

// ✅ ALREADY DONE DETAILS SCHEMA
const alreadyDoneSchema = new mongoose.Schema(
  {
    when: String,
    where: String,
    serviceProvider: String,
  },
  { _id: false }
);

// ✅ MAIN CALL SCHEMA
const callSchema = new mongoose.Schema(
  {
    // ═══════════════════════════════════════════════════════════
    // CALL METADATA (from Twilio + API call)
    // ═══════════════════════════════════════════════════════════
    callSid: {
      type: String,
      required: true,
      unique: true,
      index: true,
      sparse: true,
    },

    // ═══════════════════════════════════════════════════════════
    // CUSTOMER DETAILS (passed from /outbound/call API)
    // ═══════════════════════════════════════════════════════════
    customerPhone: {
      type: String,
      required: true,
      index: true,
    },
    customerName: {
      type: String,
      required: true,
    },

    // ═══════════════════════════════════════════════════════════
    // MACHINE DETAILS (passed from /outbound/call API)
    // ═══════════════════════════════════════════════════════════
    machineModel: {
      type: String,
      required: true,
      example: 'JCB 3DX',
    },
    machineNumber: {
      type: String,
      required: true,
      index: true,
    },
    machineType: {
      type: String,
      default: 'JCB',
    },

    // ═══════════════════════════════════════════════════════════
    // SERVICE DETAILS (passed from /outbound/call API)
    // ═══════════════════════════════════════════════════════════
    serviceType: {
      type: String,
      required: true,
      example: '500 Hour Service',
    },
    dueDate: {
      type: Date,
      required: true,
    },

    // ═══════════════════════════════════════════════════════════
    // CONVERSATION DATA (built during call)
    // ═══════════════════════════════════════════════════════════
    messages: {
      type: [messageSchema],
      default: [],
    },
    conversationTranscript: {
      type: String,
      default: '',
    },

    // ═══════════════════════════════════════════════════════════
    // BOOKING INFORMATION (filled during conversation)
    // ═══════════════════════════════════════════════════════════
    booking: {
      type: bookingSchema,
      default: () => ({}),
    },

    // ═══════════════════════════════════════════════════════════
    // CALL OUTCOME & STATUS
    // ═══════════════════════════════════════════════════════════
    outcome: {
      type: String,
      enum: ['confirmed', 'already_done', 'rescheduled', 'declined', 'pending'],
      default: 'pending',
      index: true,
    },
    status: {
      type: String,
      enum: ['initiated', 'in_progress', 'completed', 'failed'],
      default: 'initiated',
      index: true,
    },

    // ═══════════════════════════════════════════════════════════
    // FOR "ALREADY DONE" CASES
    // ═══════════════════════════════════════════════════════════
    alreadyDoneDetails: {
      type: alreadyDoneSchema,
      default: null,
    },

    // ═══════════════════════════════════════════════════════════
    // CALL METRICS
    // ═══════════════════════════════════════════════════════════
    callStartedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    callEndedAt: {
      type: Date,
      default: null,
    },
    callDurationSeconds: {
      type: Number,
      default: 0,
    },
    totalTurns: {
      type: Number,
      default: 0,
    },

    // ═══════════════════════════════════════════════════════════
    // ADDITIONAL FIELDS
    // ═══════════════════════════════════════════════════════════
    notes: String,
    agentName: {
      type: String,
      default: 'Priya',
    },
  },
  {
    timestamps: true,
    collection: 'calls',
  }
);

// ✅ METHODS
callSchema.methods.getBookingSummary = function() {
  return {
    customerName: this.customerName,
    machineModel: this.machineModel,
    machineNumber: this.machineNumber,
    serviceType: this.serviceType,
    confirmedServiceDate: this.booking.confirmedServiceDate,
    confirmedServiceDateISO: this.booking.confirmedServiceDateISO,
    assignedBranchCity: this.booking.assignedBranchCity,
    assignedBranchName: this.booking.assignedBranchName,
    outcome: this.outcome,
    status: this.status,
  };
};

callSchema.methods.isBookingComplete = function() {
  return (
    this.outcome === 'confirmed' &&
    this.booking.confirmedServiceDate &&
    this.booking.assignedBranchCity
  );
};

export default mongoose.model('Call', callSchema);