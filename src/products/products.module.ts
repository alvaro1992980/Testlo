import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product, ProductsImage } from './entities';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService],
  imports: [
    TypeOrmModule.forFeature([
      // 👇 Register the entity class here
      Product,
      ProductsImage
    ]),
  ],
  exports: [ProductsService, TypeOrmModule]

})
export class ProductsModule { }
