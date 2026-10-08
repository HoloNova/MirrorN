---
schemaVersion: 1
id: cppreference
name: cppreference
summary: cppreference 英文站的 C 与 C++ 参考入口，用于查标准库、语法和函数签名；本站只提供链接。
category: document
tags:
  domain: [cpp]
  platform: [any]
  format: [text]
aliases: [C++ 参考手册, C++ 标准库参考, cppreference.com, C++ 文档, C 语言参考, cpp 参考]
authors: [HoloNova]
publishedAt: 2026-10-08
draft: true
status: active
---

## 它是什么

cppreference 是第三方整理的 C 与 C++ 参考站点，内容包括语言语法、标准库中的容器与算法、头文件和函数签名。它不是 C++ 标准原文，但写代码时经常用它核对接口的用法。

学习时可以把它当作查询手册：忘记某个函数怎么用、参数是什么、需要包含哪个头文件，就到这里查。

## 怎么查

- 在搜索引擎中输入函数名或类名，并加上 cppreference，例如 `std::vector cppreference`。
- 进入英文站后，用页面上的搜索框直接输入名称查找。
- 留意页面标注的标准版本（如 C++17、C++20）和所需头文件，确认与课程使用的标准一致。

## 常见问题

:::details{title="页面是英文，看不懂说明"}
先看代码示例和函数签名，它们最直观。遇到专门术语，可以借助翻译工具，但以页面上的代码和标注为准。
:::

:::details{title="找不到某个函数或类"}
先确认它属于 C 还是 C++，再确认课程使用的标准版本。很多接口是在较新的标准中加入的，旧标准或旧编译器下可能无法使用。
:::

:::details{title="示例能否直接运行"}
页面中的示例用于说明写法，不保证能在你的编译器和设置下直接运行。编译时，请对照自己所用的编译器和标准选项。
:::

## 相关链接

::source-list{group="reference"}
