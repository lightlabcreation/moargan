const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Clearing old data...');
  await prisma.booking.deleteMany({});
  await prisma.trip.deleteMany({});
  await prisma.tripRequest.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.destination.deleteMany({});
  await prisma.fuelLog.deleteMany({});
  await prisma.maintenanceLog.deleteMany({});

  console.log('🌱 Seeding fresh simple data...');

  const hashedPassword = await bcrypt.hash('123', 10);

  // 1. Users
  await prisma.user.createMany({
    data: [
      { name: 'Admin Kiaan', email: 'admin@morgan.com', password: hashedPassword, role: 'admin', password_set: true, invitation_sent: true },
      { name: 'Expert Driver', email: 'driver@morgan.com', password: hashedPassword, role: 'driver', password_set: true, invitation_sent: true },
      { name: 'Kiaan Resident', email: 'resident@morgan.com', password: hashedPassword, role: 'tenant', password_set: true, invitation_sent: true, source: 'PMS' }
    ]
  });

  // 2. Clear Trips and Requests (Leave Empty)
  console.log('✨ Database cleared. No active trips or requests.');

  // 3. Destinations
  const destinations = ['Morgan Campus', 'Station Mont-Tremblant', 'Village Center'];
  for (const name of destinations) {
    await prisma.destination.create({ data: { name } });
  }

  console.log('✅ Clean Database Ready - Login with admin@morgan.com / 123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
