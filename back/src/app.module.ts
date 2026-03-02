import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { User } from "./user/user.entity";
import { UserModule } from "./user/user.module";

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRootAsync({
            useFactory: (config: ConfigService) => ({
                type: "postgres",
                host: config.get("DB_HOST"),
                port: config.get<number>("DB_PORT"),
                username: config.get("DB_USER"),
                password: config.get("DB_PASSWORD"),
                database: config.get("DB_NAME"),
                entities: [User],
                synchronize: true, // à désactiver en production
            }),
            inject: [ConfigService],
        }),
        UserModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
