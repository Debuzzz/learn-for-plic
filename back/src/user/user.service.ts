import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "./user.entity";

@Injectable()
export class UserService {
    constructor(
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
    ) {}

    create(data: { name: string; email: string }): Promise<User> {
        const user = this.userRepo.create(data);
        return this.userRepo.save(user);
    }

    async remove(id: number): Promise<void> {
        const user = await this.userRepo.findOneBy({ id });
        if (!user) throw new NotFoundException(`User #${id} not found`);
        await this.userRepo.remove(user);
    }

    findAll(): Promise<User[]> {
        return this.userRepo.find();
    }
}
