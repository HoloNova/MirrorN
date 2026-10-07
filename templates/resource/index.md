---
schemaVersion: 1
id: resource-id
name: 新资源名称
category: document
draft: true
---

## 用途与适用场景

说明资源解决的问题、适用对象，以及版本或平台限制。发布前填写 summary、tags、authors、publishedAt、status；修改 category 和名称，汉字开头的公开名称还须填写 ASCII 拼音 sortKey。

## 获取与使用

在 sources.json 中维护真实来源。完成来源数据后，以 `::download{source="来源ID"}`、`::source-list{group="组ID"}` 或 `::install-command{source="包管理来源ID"}` 引用，不在正文手写组件或服务器路径。纯文档不强制提供下载文件。

## 来源依据与维护说明

说明核查过的官网、仓库、适用范围和日期；未确认的兼容性或校验信息应如实写明。引用第三方内容和上传附件时保留出处、作者与各自许可。本文内容编写完成后删除这些写作说明，再按贡献流程提交审核。
