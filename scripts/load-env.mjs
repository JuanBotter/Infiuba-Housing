import path from "node:path";

function tryLoad(fileName) {
  try {
    process.loadEnvFile(path.join(process.cwd(), fileName));
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }
  }
}

tryLoad(".env");
tryLoad(".env.local");
