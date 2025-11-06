-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('Admin', 'Cashier', 'Dispatcher', 'BallHandler', 'Serviceman');

-- CreateEnum
CREATE TYPE "public"."BayStatus" AS ENUM ('Available', 'Occupied', 'Maintenance', 'SpecialUse', 'Unavailable');

-- CreateEnum
CREATE TYPE "public"."ServicemanStatus" AS ENUM ('Available', 'Assigned', 'OnBreak');

-- CreateTable
CREATE TABLE "public"."Employee" (
    "employee_id" SERIAL NOT NULL,
    "full_name" TEXT NOT NULL,
    "username" TEXT,
    "password" TEXT,
    "role" "public"."Role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("employee_id")
);

-- CreateTable
CREATE TABLE "public"."Player" (
    "player_id" SERIAL NOT NULL,
    "nickname" TEXT,
    "receipt_number" TEXT,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "price_per_hour" DECIMAL(10,2) NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("player_id")
);

-- CreateTable
CREATE TABLE "public"."Bay" (
    "bay_id" SERIAL NOT NULL,
    "bay_number" TEXT NOT NULL,
    "status" "public"."BayStatus" NOT NULL DEFAULT 'Available',
    "note" TEXT,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bay_pkey" PRIMARY KEY ("bay_id")
);

-- CreateTable
CREATE TABLE "public"."BallBucketInventory" (
    "inventory_id" SERIAL NOT NULL,
    "record_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_buckets_start" INTEGER NOT NULL,
    "total_buckets_remaining" INTEGER NOT NULL,
    "bottom_limit" INTEGER NOT NULL DEFAULT 100,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "BallBucketInventory_pkey" PRIMARY KEY ("inventory_id")
);

-- CreateTable
CREATE TABLE "public"."BayAssignment" (
    "assignment_id" SERIAL NOT NULL,
    "player_id" INTEGER,
    "bay_id" INTEGER NOT NULL,
    "dispatcher_id" INTEGER NOT NULL,
    "serviceman_id" INTEGER,
    "assigned_time" TIMESTAMP(3) NOT NULL,
    "open_time" BOOLEAN NOT NULL DEFAULT false,
    "end_time" TIMESTAMP(3),

    CONSTRAINT "BayAssignment_pkey" PRIMARY KEY ("assignment_id")
);

-- CreateTable
CREATE TABLE "public"."BallTransaction" (
    "transaction_id" SERIAL NOT NULL,
    "assignment_id" INTEGER NOT NULL,
    "handler_id" INTEGER NOT NULL,
    "bucket_count" INTEGER NOT NULL,
    "delivered_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BallTransaction_pkey" PRIMARY KEY ("transaction_id")
);

-- CreateTable
CREATE TABLE "public"."ServicemanQueue" (
    "queue_id" SERIAL NOT NULL,
    "serviceman_id" INTEGER NOT NULL,
    "status" "public"."ServicemanStatus" NOT NULL DEFAULT 'Available',
    "assigned_bay" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServicemanQueue_pkey" PRIMARY KEY ("queue_id")
);

-- CreateTable
CREATE TABLE "public"."SystemLog" (
    "log_id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "role" "public"."Role" NOT NULL,
    "action" TEXT NOT NULL,
    "session_type" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "related_record" TEXT,
    "approved_by" INTEGER,

    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "notification_id" SERIAL NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_read" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable
CREATE TABLE "public"."ChatRoom" (
    "chat_id" SERIAL NOT NULL,
    "name" TEXT,
    "is_group" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatRoom_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "public"."ChatMessage" (
    "message_id" SERIAL NOT NULL,
    "chat_id" INTEGER NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "recipient_id" INTEGER,
    "content" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_read" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable
CREATE TABLE "public"."ChatParticipant" (
    "participant_id" SERIAL NOT NULL,
    "chat_id" INTEGER NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatParticipant_pkey" PRIMARY KEY ("participant_id")
);

-- CreateTable
CREATE TABLE "public"."SystemSetting" (
    "setting_id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("setting_id")
);

-- CreateTable
CREATE TABLE "public"."SiteConfig" (
    "site_id" SERIAL NOT NULL,
    "site_name" TEXT NOT NULL DEFAULT 'Eagle Point',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Manila',
    "currency_symbol" TEXT NOT NULL DEFAULT '₱',
    "default_language" TEXT NOT NULL DEFAULT 'en',
    "enable_reservations" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteConfig_pkey" PRIMARY KEY ("site_id")
);

-- CreateTable
CREATE TABLE "public"."PricingConfig" (
    "pricing_id" SERIAL NOT NULL,
    "timed_session_rate" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "open_time_rate" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingConfig_pkey" PRIMARY KEY ("pricing_id")
);

-- CreateTable
CREATE TABLE "public"."OperationalConfig" (
    "operational_id" SERIAL NOT NULL,
    "total_available_bays" INTEGER NOT NULL DEFAULT 45,
    "standard_tee_interval_minutes" INTEGER NOT NULL DEFAULT 10,
    "ball_bucket_warning_threshold" INTEGER NOT NULL DEFAULT 5,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalConfig_pkey" PRIMARY KEY ("operational_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_username_key" ON "public"."Employee"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Player_receipt_number_key" ON "public"."Player"("receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "public"."SystemSetting"("key");

-- AddForeignKey
ALTER TABLE "public"."Employee" ADD CONSTRAINT "Employee_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."Employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Player" ADD CONSTRAINT "Player_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."Employee"("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Bay" ADD CONSTRAINT "Bay_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."Employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BallBucketInventory" ADD CONSTRAINT "BallBucketInventory_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."Employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BayAssignment" ADD CONSTRAINT "BayAssignment_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."Player"("player_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BayAssignment" ADD CONSTRAINT "BayAssignment_bay_id_fkey" FOREIGN KEY ("bay_id") REFERENCES "public"."Bay"("bay_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BayAssignment" ADD CONSTRAINT "BayAssignment_dispatcher_id_fkey" FOREIGN KEY ("dispatcher_id") REFERENCES "public"."Employee"("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BayAssignment" ADD CONSTRAINT "BayAssignment_serviceman_id_fkey" FOREIGN KEY ("serviceman_id") REFERENCES "public"."Employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BallTransaction" ADD CONSTRAINT "BallTransaction_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."BayAssignment"("assignment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BallTransaction" ADD CONSTRAINT "BallTransaction_handler_id_fkey" FOREIGN KEY ("handler_id") REFERENCES "public"."Employee"("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServicemanQueue" ADD CONSTRAINT "ServicemanQueue_serviceman_id_fkey" FOREIGN KEY ("serviceman_id") REFERENCES "public"."Employee"("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServicemanQueue" ADD CONSTRAINT "ServicemanQueue_assigned_bay_fkey" FOREIGN KEY ("assigned_bay") REFERENCES "public"."Bay"("bay_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SystemLog" ADD CONSTRAINT "SystemLog_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."Employee"("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SystemLog" ADD CONSTRAINT "SystemLog_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."Employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMessage" ADD CONSTRAINT "ChatMessage_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."ChatRoom"("chat_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMessage" ADD CONSTRAINT "ChatMessage_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."Employee"("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMessage" ADD CONSTRAINT "ChatMessage_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."Employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatParticipant" ADD CONSTRAINT "ChatParticipant_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."ChatRoom"("chat_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatParticipant" ADD CONSTRAINT "ChatParticipant_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."Employee"("employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;
