import { DataSource } from "typeorm"
import verifiedUserModel from "./models/verifiedUserModel";
import communityConfigModel from "./models/communityConfigModel";

const connection = new DataSource({
    type: "mongodb",
    host: process.env.MONGODB_URL || "localhost",
    port: Number(process.env.MONGODB_PORT)|| 27017,
    database: process.env.MONGODB_DB || "rooki_verification_bot",
    username: process.env.MONGODB_USERNAME,
    password: process.env.MONGODB_PASSWORD,
    authSource: process.env.MONGODB_AUTHSOURCE || "admin",
    entities: [verifiedUserModel, communityConfigModel],
})


export default connection;
