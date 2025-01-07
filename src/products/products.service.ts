import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { PaginationDto } from 'src/common/dtos/Pagination.dto';
import { validate as isUUID } from 'uuid';
import { ProductsImage } from './entities';

@Injectable()
export class ProductsService {

  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,

    @InjectRepository(ProductsImage)
    private readonly ProductsImageRepository: Repository<ProductsImage>,

    private readonly dataSource: DataSource
  ) { }

  async create(createProductDto: CreateProductDto) {
    try {
      const { images = [], ...productDetails } = createProductDto;
      const product = this.productRepository.create({
        ...productDetails,
        images: images.map(
          image => this.ProductsImageRepository.create({ url: image })
        )
      });
      await this.productRepository.save(product);
      return { ...product, images };
    } catch (error) {
      this.habdleDBException(error);
    }
  }

  async findAll(paginationDto: PaginationDto) {
    const { limit = 10, offset = 0 } = paginationDto;
    const products = await this.productRepository.find({
      skip: offset,
      take: limit,
      relations: {
        images: true
      }
    });
    return products.map(
      product => ({ ...product, images: product.images.map(image => image.url) })
    );
  }

  async findOne(term: string) {
    let product: Product;
    if (isUUID(term)) {
      product = await this.productRepository.findOneBy({ id: term });
    } else {
      const queryBuilder = this.productRepository.createQueryBuilder('prod');
      product = await queryBuilder
        .where('UPPER(title) =:title or slug = :slug',
          {
            slug: term.toLowerCase(),
            title: term.toLowerCase()
          })
        .leftJoinAndSelect('prod.images', 'images')
        .getOne();
    }
    if (!product)
      throw new NotFoundException(`Product with id ${term} not found`);
    return product;
  }

  async findOnePlain(term: string) {
    const { images = [], ...rest } = await this.findOne(term);
    return {
      ...rest,
      images: images.map(image => image.url)
    }
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    const { images, ...toUpdate } = updateProductDto;
    const product = await this.productRepository.preload({
      id,
      ...toUpdate
    });

    // create query runner
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {

      if (images) {
        await queryRunner.manager.delete(ProductsImage, { product: { id } });
        product.images = images.map(
          image => this.ProductsImageRepository.create({ url: image })
        );
      }

      await queryRunner.manager.save(product);
      await queryRunner.commitTransaction();
      await queryRunner.release();
      return this.findOnePlain(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
      this.habdleDBException(error);
    }
  }

  async remove(id: string) {
    const product = await this.productRepository.findOneBy({ id });
    await this.productRepository.remove(product);
  }

  private habdleDBException(error: any) {
    if (error.code === '23505')
      throw new BadRequestException(error.detail);
    this.logger.error(error.message);
    throw new InternalServerErrorException(`Unexpected error: ${error.message}`);
  }

  async deleteAllProducts() {
    const query = this.productRepository.createQueryBuilder('product');
    try {
      return await query
        .delete()
        .where({})
        .execute();
    } catch (error) {
      this.habdleDBException(error);
    }
  }
}
